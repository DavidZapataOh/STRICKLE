import { ARC_DOMAIN, type IrisMessage, type SourceChain, type trackDeposit, sourceChain } from "@strickle/arc/bridge";
import type { ArcNetworkName } from "@strickle/arc/networks";
import { type DepositRow, createDeposit, getDeposit, recordArrival, recordBurn } from "@strickle/db/deposits";
import type { createLimiter } from "@strickle/db/limiter";
import { createHash } from "node:crypto";
import type { Sql } from "postgres";
import type { Address, Hex } from "viem";
import { z } from "zod";

export type DepositApiResult =
  | { status: "created"; id: string }
  | { status: "ok"; deposit: { id: string; state: DepositRow["status"]; received?: string; forwardTx?: string } }
  | { status: "rejected" | "conflict" | "rate-limited" | "unknown-vault" | "not-found" | "closed" | "unavailable" | "misconfigured"; retryAfterSeconds?: number };

export interface DepositDeps {
  env: Record<string, string | undefined>;
  sql: Sql;
  limiter: Pick<ReturnType<typeof createLimiter>, "count">;
  guard: { vault(vault: Address): Promise<{ registered: boolean }> };
  access(request: Request): Promise<"allow" | "deny" | "closed">;
  track(input: { network: ArcNetworkName; source: SourceChain; burnTx: Hex; vault: Address }): ReturnType<typeof trackDeposit>;
  burn(domain: number, burnTx: Hex): Promise<IrisMessage | null>;
  burnSender(chainId: number, burnTx: Hex): Promise<Address | null>;
  network: ArcNetworkName;
  onArrived?(row: DepositRow, arrival: { forwardTx: Hex; received: bigint; payer: Address; logIndex: number; at: Date }): Promise<void>;
}

const MAX_BODY = 2_000;
const MIN_AMOUNT = 10_000n; // US$0.01
const MAX_AMOUNT = 1_000_000_000_000n; // US$1,000,000: a sanity ceiling, not a policy
const IRIS_RETRY_SECONDS = 5;
const UNIQUE_VIOLATION = "23505";

const address = z.string().regex(/^0x[0-9a-fA-F]{40}$/);
const createBody = z.object({
  vault: address,
  sourceChain: z.string().max(40),
  sourceAddress: address,
  amount: z.string().regex(/^[1-9][0-9]{0,15}$/),
  speed: z.enum(["fast", "slow"]),
  feeMode: z.enum(["source", "destination"]),
  intent: z.enum(["income", "own", "unsure"]),
});
const updateBody = z.object({ burnTx: z.string().regex(/^0x[0-9a-fA-F]{64}$/) });

const STATUS: Record<DepositApiResult["status"], number> = { created: 201, ok: 200, rejected: 400, conflict: 409, "rate-limited": 429, "unknown-vault": 404, "not-found": 404, closed: 503, unavailable: 502, misconfigured: 503 };
const done = (body: DepositApiResult) => ({ status: STATUS[body.status], body });

const clientIp = (request: Request): string => (request.headers.get("x-real-ip") ?? request.headers.get("x-forwarded-for")?.split(",")[0] ?? "unknown").trim();
const ipKey = (scope: string, pepper: string, request: Request) => `${scope}:${createHash("sha256").update(`${pepper}:${clientIp(request)}`).digest("hex")}`;

async function readJson(request: Request): Promise<unknown> {
  const text = await request.text();
  if (text.length > MAX_BODY) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

const sameOrigin = (request: Request) => {
  const origin = request.headers.get("origin");
  return origin !== null && origin === new URL(request.url).origin;
};

export async function handleCreateDeposit(request: Request, deps: DepositDeps): Promise<{ status: number; body: DepositApiResult }> {
  if (!sameOrigin(request)) return done({ status: "rejected" });
  const parsed = createBody.safeParse(await readJson(request));
  if (!parsed.success) return done({ status: "rejected" });
  const input = parsed.data;
  const amount = BigInt(input.amount);
  if (amount < MIN_AMOUNT || amount > MAX_AMOUNT) return done({ status: "rejected" });
  let source: SourceChain;
  try {
    source = sourceChain(deps.network, input.sourceChain);
  } catch {
    return done({ status: "rejected" });
  }

  const access = await deps.access(request);
  if (access === "closed") return done({ status: "closed" });
  if (access === "deny") return done({ status: "rejected" });
  const pepper = deps.env.RELAY_IP_PEPPER;
  if (!pepper) return done({ status: "misconfigured" });

  try {
    const ip = await deps.limiter.count(ipKey("deposit-ip", pepper, request), 60, 30);
    if (!ip.allowed) return done({ status: "rate-limited", retryAfterSeconds: ip.retryAfterSeconds });
    if (!(await deps.guard.vault(input.vault as Address)).registered) return done({ status: "unknown-vault" });
    const vault = await deps.limiter.count(`deposit-vault:${input.vault.toLowerCase()}`, 3_600, 10);
    if (!vault.allowed) return done({ status: "rate-limited", retryAfterSeconds: vault.retryAfterSeconds });
    const id = await createDeposit(deps.sql, { ...input, sourceChain: source.id, amount });
    return done({ status: "created", id });
  } catch {
    return done({ status: "unavailable" });
  }
}

export async function handleDepositUpdate(request: Request, id: string, deps: DepositDeps): Promise<{ status: number; body: DepositApiResult }> {
  if (!sameOrigin(request)) return done({ status: "rejected" });
  const parsed = updateBody.safeParse(await readJson(request));
  if (!parsed.success) return done({ status: "rejected" });
  const burnTx = parsed.data.burnTx.toLowerCase() as Hex;

  const access = await deps.access(request);
  if (access === "closed") return done({ status: "closed" });
  if (access === "deny") return done({ status: "rejected" });
  const pepper = deps.env.RELAY_IP_PEPPER;
  if (!pepper) return done({ status: "misconfigured" });

  try {
    const ip = await deps.limiter.count(ipKey("deposit-update-ip", pepper, request), 60, 30);
    if (!ip.allowed) return done({ status: "rate-limited", retryAfterSeconds: ip.retryAfterSeconds });
    const row = await getDeposit(deps.sql, id);
    if (!row) return done({ status: "not-found" });
    if (row.burnTx) return row.burnTx === burnTx ? done(okBody(row)) : done({ status: "rejected" });
    if (row.status !== "created") return done({ status: "rejected" });

    const source = sourceChain(deps.network, row.sourceChain);
    const message = await deps.burn(source.domain, burnTx);
    // a pending message has no decoded body yet, so there is nothing to compare: the client asks again
    if (!message || message.destinationDomain === null || message.amount === null) return done({ status: "rejected", retryAfterSeconds: IRIS_RETRY_SECONDS });
    if (message.destinationDomain !== ARC_DOMAIN || message.amount !== row.amount) return done({ status: "rejected" });
    const sender = await deps.burnSender(source.chainId, burnTx);
    if (!sender) return done({ status: "rejected", retryAfterSeconds: IRIS_RETRY_SECONDS });
    if (sender.toLowerCase() !== row.sourceAddress.toLowerCase()) return done({ status: "rejected" });

    try {
      if (!(await recordBurn(deps.sql, id, burnTx))) return done({ status: "rejected" });
    } catch (error) {
      if ((error as { code?: string }).code === UNIQUE_VIOLATION) return done({ status: "conflict" });
      throw error;
    }
    const updated = await getDeposit(deps.sql, id);
    return updated ? done(okBody(updated)) : done({ status: "not-found" });
  } catch {
    return done({ status: "unavailable" });
  }
}

export async function handleDepositRead(request: Request, id: string, deps: DepositDeps): Promise<{ status: number; body: DepositApiResult }> {
  const access = await deps.access(request);
  if (access === "closed") return done({ status: "closed" });
  if (access === "deny") return done({ status: "rejected" });
  const pepper = deps.env.RELAY_IP_PEPPER;
  if (!pepper) return done({ status: "misconfigured" });

  try {
    const ip = await deps.limiter.count(ipKey("deposit-read-ip", pepper, request), 60, 120);
    if (!ip.allowed) return done({ status: "rate-limited", retryAfterSeconds: ip.retryAfterSeconds });
    let row = await getDeposit(deps.sql, id);
    if (!row) return done({ status: "not-found" });
    if (row.status === "burned" && row.burnTx) {
      const tracked = await deps.track({ network: deps.network, source: sourceChain(deps.network, row.sourceChain), burnTx: row.burnTx as Hex, vault: row.vault as Address });
      if (tracked.state === "arrived" && (await recordArrival(deps.sql, id, { forwardTx: tracked.forwardTx, received: tracked.received }))) {
        await deps.onArrived?.(row, { forwardTx: tracked.forwardTx, received: tracked.received, payer: tracked.payer, logIndex: tracked.logIndex, at: tracked.at });
      }
      row = (await getDeposit(deps.sql, id)) ?? row;
    }
    return done(okBody(row));
  } catch {
    return done({ status: "unavailable" });
  }
}

function okBody(row: DepositRow): DepositApiResult {
  return { status: "ok", deposit: { id: row.id, state: row.status, ...(row.received !== null ? { received: row.received.toString() } : {}), ...(row.forwardTx ? { forwardTx: row.forwardTx } : {}) } };
}
