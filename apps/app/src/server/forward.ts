import "server-only";
import { createJwt } from "@strickle/agent/gateway";
import { randomUUID } from "node:crypto";
import type { Hex } from "viem";

export type GatewayResult = "accepted" | "busy" | "rejected" | "unavailable";

// Our own HTTP call instead of the script's helper: an HTTP 429 or a plain-text answer must read as "busy", not as a network failure.
export async function postToGateway(args: { url: string; workflowId: string; privateKey: Hex; envelope: { vault: string; sealed: string }; fetchImpl?: typeof fetch; timeoutMs?: number }): Promise<GatewayResult> {
  const request = { jsonrpc: "2.0", id: randomUUID(), method: "workflows.execute", params: { input: args.envelope, workflow: { workflowID: args.workflowId.replace(/^0x/, "") } } };
  let response: Response;
  try {
    response = await (args.fetchImpl ?? fetch)(args.url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${await createJwt(request, args.privateKey)}` },
      body: JSON.stringify(request),
      signal: AbortSignal.timeout(args.timeoutMs ?? 15_000),
      cache: "no-store",
    });
  } catch {
    return "unavailable";
  }
  if (response.status === 429) return "busy";
  if (response.status >= 500) return "unavailable";
  let answer: { result?: { status?: string }; error?: { code?: number; message?: string } };
  try {
    answer = await response.json();
  } catch {
    return "rejected";
  }
  if (answer.result?.status === "ACCEPTED") return "accepted";
  return /429|rate|limit|too many/i.test(`${answer.error?.code ?? ""} ${answer.error?.message ?? ""}`) ? "busy" : "rejected";
}
