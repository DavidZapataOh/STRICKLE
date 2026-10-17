import { creditedLog } from "@strickle/arc/bridge";
import type { ArcNetworkName } from "@strickle/arc/networks";
import type { InvoiceKeys } from "@strickle/db/invoice-keys";
import type { createLimiter } from "@strickle/db/limiter";
import { type OnrampSessionRow, findOnrampSession, recordWebhook, releaseWebhook, settleOnrampSession } from "@strickle/db/onramp";
import { settlePayment } from "@strickle/db/payments";
import { createHash } from "node:crypto";
import type { Sql } from "postgres";
import type { Address, Hex } from "viem";
import { z } from "zod";
import { type PublicKeyLookup, verifyCircleSignature } from "./circle-signature.ts";
import type { ChainReader } from "./reconcile.ts";

const MAX_BODY = 64_000;
const IP_LIMIT = 120;

// The notification contract for Onramp is not documented: this is what the reference application infers, every field but the destination is optional, and anything it cannot map fails closed. Nothing in it is used for money; the chain is.
export const SettledNotification = z.object({
  sessionId: z.string().optional(),
  userId: z.string().optional(),
  appUserId: z.string().optional(),
  destinationAddress: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
  destinationChain: z.string().optional(),
  amount: z.union([z.string(), z.number()]).optional(),
  tokenSymbol: z.string().optional(),
  transactionHash: z.string().regex(/^0x[0-9a-fA-F]{64}$/).optional(),
});
export type Settled = z.infer<typeof SettledNotification>;

export function parseOnrampSettled(body: unknown): { ok: true; value: Settled } | { ok: false; reason: string } {
  const notification = typeof body === "object" && body !== null ? (body as { notification?: unknown }).notification : undefined;
  const parsed = SettledNotification.safeParse(notification);
  return parsed.success ? { ok: true, value: parsed.data } : { ok: false, reason: parsed.error.issues[0]?.message ?? "unreadable" };
}

export interface WebhookDeps {
  env: { RELAY_IP_PEPPER?: string };
  sql: Sql;
  limiter: Pick<ReturnType<typeof createLimiter>, "count">;
  keys: InvoiceKeys;
  lookup: PublicKeyLookup;
  chain: ChainReader;
  chainId: number;
  usdc: Address;
  network: ArcNetworkName;
}

type Outcome = { status: number; body: Record<string, unknown> };
const reply = (status: number, body: Record<string, unknown> = {}): Outcome => ({ status, body });
const clientIp = (request: Request): string => (request.headers.get("x-real-ip") ?? request.headers.get("x-forwarded-for")?.split(",")[0] ?? "unknown").trim();

async function settleOnrampDeposit(deps: WebhookDeps, body: unknown): Promise<"credited" | "extra" | "duplicate" | "unresolved"> {
  const parsed = parseOnrampSettled(body);
  if (!parsed.ok) return "unresolved";
  const n = parsed.value;
  let session: OnrampSessionRow | null = n.sessionId ? await findOnrampSession(deps.sql, { circleSessionId: n.sessionId }) : null;
  const ours = n.userId ?? n.appUserId;
  if (!session && ours) session = await findOnrampSession(deps.sql, { id: ours });
  if (!session || !n.transactionHash || n.destinationAddress.toLowerCase() !== session.vault.toLowerCase()) return "unresolved";
  const receipt = await deps.chain.receipt(n.transactionHash as Hex);
  // a node that has not seen the transaction yet is a delay, not a verdict: throwing releases the event so Circle retries
  if (!receipt) throw new Error("the transaction is not visible yet");
  if (receipt.status !== "success") return "unresolved";
  const [credit] = creditedLog(receipt, deps.usdc, session.vault as Address);
  if (!credit) return "unresolved";
  const settled = await settlePayment(deps.sql, { chainId: deps.chainId, txHash: n.transactionHash, logIndex: credit.logIndex, vault: session.vault, payer: credit.from, amount: credit.amount, rail: "onramp", linkId: session.linkId, at: await deps.chain.blockTime(receipt.blockNumber) });
  if (settled.outcome === "unmatched") return "unresolved";
  if (settled.outcome === "credited" || settled.outcome === "extra") await settleOnrampSession(deps.sql, session.id, n.transactionHash);
  return settled.outcome;
}

export async function handleCircleWebhook(request: Request, deps: WebhookDeps): Promise<Outcome> {
  const pepper = deps.env.RELAY_IP_PEPPER;
  if (!pepper) return reply(503, { error: "misconfigured" });
  try {
    // every unsigned request would otherwise cost a lookup of an attacker-chosen key id
    const ip = await deps.limiter.count(`circle-webhook-ip:${createHash("sha256").update(`${pepper}:${clientIp(request)}`).digest("hex")}`, 60, IP_LIMIT);
    if (!ip.allowed) return reply(429);
  } catch {
    return reply(502);
  }
  const text = await request.text();
  if (text.length > MAX_BODY) return reply(413);
  const signature = request.headers.get("x-circle-signature");
  const keyId = request.headers.get("x-circle-key-id");
  if (!signature || !keyId) return reply(400);
  if (!(await verifyCircleSignature({ body: text, signature, keyId, lookup: deps.lookup }))) return reply(403);
  let payload: { notificationType?: string; notification?: { id?: string } };
  try {
    payload = JSON.parse(text);
  } catch {
    return reply(400);
  }
  const id = payload.notification?.id;
  if (payload.notificationType === "webhooks.test" || !id) return reply(200, { received: true });
  try {
    if ((await recordWebhook(deps.sql, { notificationId: id, type: payload.notificationType ?? "unknown", payload })) === "duplicate") return reply(200, { received: true, duplicate: true });
  } catch {
    return reply(500);
  }
  if (payload.notificationType !== "onramp.deposit.settled") return reply(200, { received: true });
  try {
    return reply(200, { received: true, applied: await settleOnrampDeposit(deps, payload) });
  } catch {
    // a failure that may pass: the event is not marked done, so the next delivery is applied
    await releaseWebhook(deps.sql, id).catch(() => undefined);
    return reply(500);
  }
}
