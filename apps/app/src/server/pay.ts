import type { ArcNetworkName } from "@strickle/arc/networks";
import { getDeposit } from "@strickle/db/deposits";
import type { InvoiceKeys } from "@strickle/db/invoice-keys";
import type { createLimiter } from "@strickle/db/limiter";
import { type InvoiceStatus, type LinkView, getLinkByToken } from "@strickle/db/payments";
import { createHash } from "node:crypto";
import type { Sql } from "postgres";
import type { Address, Hex } from "viem";
import { z } from "zod";
import { type DepositApiResult, type DepositDeps, handleCreateDeposit, handleDepositRead, handleDepositUpdate } from "./deposits.ts";
import { type ChainReader, claimPayment, settleBoundDeposit } from "./reconcile.ts";

export interface PublicInvoice {
  label: string;
  payeeName: string;
  note: string;
  amount: string;
  paid: string;
  remaining: string;
  status: InvoiceStatus;
  expiresAt: string | null;
  expired: boolean;
  closed: boolean;
  vault: Address;
  memoId: Hex;
  chainId: number;
  usdc: Address;
  cardAvailable: boolean;
}

export type PayResult =
  | { status: "ok"; invoice: PublicInvoice }
  | { status: "claimed"; result: "credited" | "extra" | "duplicate" | "none" | "pending" }
  | { status: "not-found" | "rate-limited" | "rejected" | "unavailable" | "misconfigured"; retryAfterSeconds?: number };

export interface PayDeps {
  env: Record<string, string | undefined>;
  sql: Sql;
  keys: InvoiceKeys;
  limiter: Pick<ReturnType<typeof createLimiter>, "count">;
  chain: ChainReader;
  network: ArcNetworkName;
  chainId: number;
  usdc: Address;
  /** Card payments, when the server is configured for them; a later rail adds its own flag. */
  onramp?: { environment: "sandbox" | "production" } | null;
}

const STATUS: Record<PayResult["status"], number> = { ok: 200, claimed: 200, "not-found": 404, "rate-limited": 429, rejected: 400, unavailable: 502, misconfigured: 503 };
const done = (body: PayResult) => ({ status: STATUS[body.status], body });
const NOT_FOUND = () => done({ status: "not-found" });
const MAX_BODY = 2_000;

const clientIp = (request: Request): string => (request.headers.get("x-real-ip") ?? request.headers.get("x-forwarded-for")?.split(",")[0] ?? "unknown").trim();
const keyed = (scope: string, pepper: string, value: string) => `${scope}:${createHash("sha256").update(`${pepper}:${value}`).digest("hex")}`;
const sameOrigin = (request: Request) => {
  const origin = request.headers.get("origin");
  return origin !== null && origin === new URL(request.url).origin;
};

const toPublic = (link: LinkView, deps: PayDeps, now: number): PublicInvoice => {
  const remaining = link.amount > link.paid ? link.amount - link.paid : 0n;
  return {
    label: link.label,
    payeeName: link.payeeName,
    note: link.note,
    amount: link.amount.toString(),
    paid: link.paid.toString(),
    remaining: remaining.toString(),
    status: link.status,
    expiresAt: link.expiresAt ? link.expiresAt.toISOString() : null,
    expired: link.expiresAt !== null && link.expiresAt.getTime() < now,
    closed: link.status === "paid" || link.status === "void" || link.revoked,
    vault: link.vault as Address,
    memoId: link.memoId,
    chainId: deps.chainId,
    usdc: deps.usdc,
    cardAvailable: deps.onramp != null && !(link.status === "paid" || link.status === "void" || link.revoked) && !(link.expiresAt !== null && link.expiresAt.getTime() < now),
  };
};

export async function handlePayView(request: Request, token: string, deps: PayDeps): Promise<{ status: number; body: PayResult }> {
  const pepper = deps.env.RELAY_IP_PEPPER;
  if (!pepper) return done({ status: "misconfigured" });
  try {
    // per IP only: the token is 128 random bits, so a per-token counter would only let a stranger lock a link out
    const ip = await deps.limiter.count(keyed("pay-ip", pepper, clientIp(request)), 60, 60);
    if (!ip.allowed) return done({ status: "rate-limited", retryAfterSeconds: ip.retryAfterSeconds });
    const link = await getLinkByToken(deps.sql, deps.keys, token);
    return link ? done({ status: "ok", invoice: toPublic(link, deps, Date.now()) }) : NOT_FOUND();
  } catch {
    return done({ status: "unavailable" });
  }
}

const claimBody = z.object({ txHash: z.string().regex(/^0x[0-9a-fA-F]{64}$/) });

export async function handlePayClaim(request: Request, token: string, deps: PayDeps): Promise<{ status: number; body: PayResult }> {
  if (!sameOrigin(request)) return done({ status: "rejected" });
  const text = await request.text();
  if (text.length > MAX_BODY) return done({ status: "rejected" });
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return done({ status: "rejected" });
  }
  const parsed = claimBody.safeParse(json);
  if (!parsed.success) return done({ status: "rejected" });
  const txHash = parsed.data.txHash.toLowerCase() as Hex;
  const pepper = deps.env.RELAY_IP_PEPPER;
  if (!pepper) return done({ status: "misconfigured" });
  try {
    const ip = await deps.limiter.count(keyed("pay-claim-ip", pepper, clientIp(request)), 60, 30);
    if (!ip.allowed) return done({ status: "rate-limited", retryAfterSeconds: ip.retryAfterSeconds });
    const link = await getLinkByToken(deps.sql, deps.keys, token);
    if (!link) return NOT_FOUND();
    // a payment already on record is answered from the database: nobody can spend the budgets below to stop an honest confirmation
    const known = await deps.sql`select 1 from payments p join payment_links l on l.invoice_id = p.invoice_id where l.id = ${link.linkId} and p.tx_hash = ${txHash} and p.state in ('credited', 'extra') limit 1`;
    if (known.length > 0) return done({ status: "claimed", result: "duplicate" });
    const perHash = await deps.limiter.count(keyed("pay-claim-hash", pepper, `${link.linkId}:${txHash}`), 60, 6);
    if (!perHash.allowed) return done({ status: "rate-limited", retryAfterSeconds: perHash.retryAfterSeconds });
    const perLink = await deps.limiter.count(`pay-claim-miss:${link.linkId}`, 3_600, 200);
    if (!perLink.allowed) return done({ status: "rate-limited", retryAfterSeconds: perLink.retryAfterSeconds });
    const claimed = await claimPayment(deps, link, txHash);
    return done({ status: "claimed", result: claimed.result });
  } catch {
    return done({ status: "unavailable" });
  }
}

const DEPOSIT_STATUS: Record<DepositApiResult["status"], number> = { created: 201, ok: 200, rejected: 400, conflict: 409, "rate-limited": 429, "unknown-vault": 404, "not-found": 404, closed: 503, unavailable: 502, misconfigured: 503 };
const depositDone = (body: DepositApiResult) => ({ status: DEPOSIT_STATUS[body.status], body });

/** The bridge deposit flow, reached through a link: the vault comes from the link, the deposit is bound to it, and no invite is asked for. */
export async function handlePayDeposit(request: Request, token: string, deps: PayDeps & DepositDeps, part: { kind: "create" } | { kind: "update" | "read"; id: string }): Promise<{ status: number; body: DepositApiResult }> {
  const pepper = deps.env.RELAY_IP_PEPPER;
  if (!pepper) return depositDone({ status: "misconfigured" });
  let link: LinkView | null;
  try {
    const ip = await deps.limiter.count(keyed("pay-deposit-ip", pepper, clientIp(request)), 60, 60);
    if (!ip.allowed) return depositDone({ status: "rate-limited", retryAfterSeconds: ip.retryAfterSeconds });
    link = await getLinkByToken(deps.sql, deps.keys, token);
  } catch {
    return depositDone({ status: "unavailable" });
  }
  if (!link) return depositDone({ status: "not-found" });
  const bridge: DepositDeps = { ...deps, access: async () => "allow", onArrived: deps.onArrived ?? (async (row, arrival) => void (await settleBoundDeposit(deps, row, arrival))) };
  if (part.kind === "create") {
    const expired = link.expiresAt !== null && link.expiresAt.getTime() < Date.now();
    if (link.status === "paid" || link.status === "void" || link.revoked || expired) return depositDone({ status: "conflict" });
    return handleCreateDeposit(request, bridge, { vault: link.vault as Address, linkId: link.linkId });
  }
  try {
    const row = await getDeposit(deps.sql, part.id);
    if (!row || row.linkId !== link.linkId) return depositDone({ status: "not-found" });
  } catch {
    return depositDone({ status: "unavailable" });
  }
  return part.kind === "update" ? handleDepositUpdate(request, part.id, bridge) : handleDepositRead(request, part.id, bridge);
}
