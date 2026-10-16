import { getPublicClient } from "@/chain/client";
import { deploymentsFor } from "@/config/network";
import { openGate } from "@/server/access-gate";
import { createChainGuard } from "@/server/chain-guard";
import { relayLimiter } from "@/server/db";
import { postToGateway } from "@/server/forward";
import { type RelayResult, handleRelay } from "@/server/relay";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Built on first use: a build for a network whose contracts are not deployed must still compile.
let guard: ReturnType<typeof createChainGuard> | undefined;
const chainGuard = () => (guard ??= createChainGuard(getPublicClient(), deploymentsFor()));

const reply = (body: RelayResult, status: number) =>
  Response.json(body, { status, headers: { "cache-control": "no-store", ...(body.retryAfterSeconds ? { "retry-after": String(body.retryAfterSeconds) } : {}) } });

export async function POST(request: Request): Promise<Response> {
  const limiter = relayLimiter();
  if (!limiter) return reply({ status: "misconfigured" }, 503);
  const env = process.env;
  const result = await handleRelay(request, {
    env,
    limiter,
    chain: chainGuard(),
    gateway: (envelope) => postToGateway({ url: env.CRE_GATEWAY_URL ?? "", workflowId: env.CRE_WORKFLOW_ID ?? "", privateKey: (env.CRE_GATEWAY_KEY ?? "0x") as `0x${string}`, envelope }),
    access: openGate,
  });
  return reply(result.body, result.status);
}
