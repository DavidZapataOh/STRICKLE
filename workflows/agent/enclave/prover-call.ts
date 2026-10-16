// workflows/agent/enclave/prover-call.ts
import { HTTPClient, type TeeRuntime, ok, text } from "@chainlink/cre-sdk";
import { specToWire } from "@strickle/pool/spec-wire";
import { type Address, type Hex, hexToBytes } from "viem";
import type { Config } from "../config.ts";
import type { PrivatePlan } from "./private-pay.ts";
import { parseProveAnswer, proveBody } from "./prover-request.ts";

const http = new HTTPClient();

const authorization = (token: string) => ({ "Content-Type": { values: ["application/json"] }, Authorization: { values: [`Bearer ${token}`] } });

export function proveSpec(runtime: TeeRuntime<Config>, master: Uint8Array, vault: Address, plan: Extract<PrivatePlan, { ok: true }>, token: string, issuedAt: number): { proof: Hex; publicInputs: bigint[] } {
  const wire = specToWire(plan.spec);
  const key = hexToBytes(runtime.config.proverKey as Hex);
  const body = proveBody(master, vault, wire, key, issuedAt);
  const response = http
    .sendRequest(runtime, { url: `${runtime.config.proverUrl}/v1/prove`, method: "POST", timeout: "60s", body: Buffer.from(JSON.stringify(body)).toString("base64"), multiHeaders: authorization(token), cacheSettings: { store: false } })
    .result();
  if (!ok(response)) throw new Error("prover error");
  return parseProveAnswer(text(response));
}

export function resolveLeaf(runtime: TeeRuntime<Config>, token: string, commitment: bigint): number | undefined {
  const response = http
    .sendRequest(runtime, { url: `${runtime.config.proverUrl}/v1/leaf?c=0x${commitment.toString(16)}`, method: "GET", multiHeaders: authorization(token), cacheSettings: { store: false } })
    .result();
  if (!ok(response)) throw new Error("prover error");
  const answer = JSON.parse(text(response)) as { index: number | null };
  return answer.index ?? undefined;
}
