// workflows/agent/enclave/read.ts
import { HTTPClient, type TeeRuntime, ok, text } from "@chainlink/cre-sdk";
import type { Config } from "../config.ts";
import { type RpcRequest, batchBody, parseBatch } from "./rpc.ts";

const http = new HTTPClient();

export function ethBatch(runtime: TeeRuntime<Config>, requests: readonly RpcRequest[]): unknown[] {
  const response = http
    .sendRequest(runtime, {
      url: runtime.config.rpcUrl,
      method: "POST",
      body: batchBody(requests),
      multiHeaders: { "Content-Type": { values: ["application/json"] } },
      cacheSettings: { store: false },
    })
    .result();
  if (!ok(response)) throw new Error("rpc error");
  return parseBatch(text(response), requests.length);
}
