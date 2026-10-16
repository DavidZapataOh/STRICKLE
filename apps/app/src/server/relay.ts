import { envelopeSchema } from "@strickle/agent/signed";
import { createHash } from "node:crypto";
import type { Address, Hex } from "viem";
import type { createLimiter } from "@strickle/db/limiter";
import type { GatewayResult } from "./forward.ts";

import type { RelayResult, RelayStatus } from "./relay-types.ts";

export type { RelayResult, RelayStatus };

export interface RelayDeps {
  env: Record<string, string | undefined>;
  limiter: Pick<ReturnType<typeof createLimiter>, "count" | "claimSlot" | "releaseSlot">;
  chain: { vault(vault: Address): Promise<{ registered: boolean; hasState: boolean; paused: boolean }>; expectedWorkflowId(): Promise<Hex> };
  gateway(envelope: { vault: string; sealed: string }): Promise<GatewayResult>;
  access(request: Request): Promise<"allow" | "deny" | "closed">;
}

const MAX_BODY = 20_000;
const GATEWAY_INTERVAL_SECONDS = 30;
const IP_WINDOW_SECONDS = 60;
const IP_LIMIT = 20;

const STATUS: Record<RelayStatus, number> = { accepted: 202, busy: 429, "rate-limited": 429, rejected: 400, paused: 409, "unknown-vault": 404, closed: 503, unavailable: 502, misconfigured: 503 };
export const statusCodeFor = (result: RelayResult): number => STATUS[result.status];

const done = (result: RelayResult) => ({ status: statusCodeFor(result), body: result });

const clientIp = (request: Request): string => (request.headers.get("x-real-ip") ?? request.headers.get("x-forwarded-for")?.split(",")[0] ?? "unknown").trim();

export async function handleRelay(request: Request, deps: RelayDeps): Promise<{ status: number; body: RelayResult }> {
  const origin = request.headers.get("origin");
  if (!origin || origin !== new URL(request.url).origin) return done({ status: "rejected" });
  const text = await request.text();
  if (text.length > MAX_BODY) return done({ status: "rejected" });
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return done({ status: "rejected" });
  }
  const parsed = envelopeSchema.safeParse(body);
  if (!parsed.success) return done({ status: "rejected" });
  const envelope = parsed.data;

  const access = await deps.access(request);
  if (access === "closed") return done({ status: "closed" });
  if (access === "deny") return done({ status: "rejected" });

  const { CRE_GATEWAY_KEY: key, CRE_GATEWAY_URL: url, CRE_WORKFLOW_ID: workflowId, RELAY_IP_PEPPER: pepper } = deps.env;
  if (!key || !url || !workflowId || !pepper || !/^0x[0-9a-fA-F]{64}$/.test(key)) return done({ status: "misconfigured" });

  const slots: { vault?: { key: string; token: string }; gateway?: { key: string; token: string } } = {};
  try {
    // a workflow redeploy changes its ID: a stale variable would turn every request into a silent rejection
    if ((await deps.chain.expectedWorkflowId()).toLowerCase() !== workflowId.toLowerCase()) return done({ status: "misconfigured" });

    const ip = await deps.limiter.count(`ip:${createHash("sha256").update(`${pepper}:${clientIp(request)}`).digest("hex")}`, IP_WINDOW_SECONDS, IP_LIMIT);
    if (!ip.allowed) return done({ status: "rate-limited", retryAfterSeconds: ip.retryAfterSeconds });

    const state = await deps.chain.vault(envelope.vault as Address);
    if (!state.registered || !state.hasState) return done({ status: "unknown-vault" });
    if (state.paused) return done({ status: "paused" });

    const vaultKey = `vault:${envelope.vault.toLowerCase()}`;
    const vault = await deps.limiter.claimSlot(vaultKey, GATEWAY_INTERVAL_SECONDS);
    if (!vault.claimed) return done({ status: "busy", retryAfterSeconds: vault.retryAfterSeconds });
    slots.vault = { key: vaultKey, token: vault.token };

    const gatewayKey = `gateway:${workflowId.toLowerCase()}`;
    const gateway = await deps.limiter.claimSlot(gatewayKey, GATEWAY_INTERVAL_SECONDS);
    if (!gateway.claimed) {
      await deps.limiter.releaseSlot(vaultKey, vault.token);
      return done({ status: "busy", retryAfterSeconds: gateway.retryAfterSeconds });
    }
    slots.gateway = { key: gatewayKey, token: gateway.token };
  } catch {
    // the database or the chain cannot be reached: the relay closes instead of opening
    return done({ status: "unavailable" });
  }

  const result = await deps.gateway(envelope);
  if (result !== "accepted") {
    // a request the gateway did not take costs no one any budget
    await Promise.allSettled([slots.vault, slots.gateway].flatMap((slot) => (slot ? [deps.limiter.releaseSlot(slot.key, slot.token)] : [])));
    return done(result === "busy" ? { status: "busy", retryAfterSeconds: GATEWAY_INTERVAL_SECONDS } : { status: result });
  }
  return done({ status: "accepted" });
}
