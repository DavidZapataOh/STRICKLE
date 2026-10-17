import { HTTPClient, type TeeRuntime, ok, text } from "@chainlink/cre-sdk";
import type { Config } from "../config.ts";

const http = new HTTPClient();

/** Circle's keyless Earn service: the request names the vault, the yield vault and the amount, which the move publishes on chain a moment later anyway. */
export function circleEarn(runtime: TeeRuntime<Config>, path: string, body: string): unknown {
  const response = http
    .sendRequest(runtime, {
      url: `${runtime.config.earn.circleUrl}/v1/earnKit${path}`,
      method: "POST",
      timeout: "30s",
      body: Buffer.from(body).toString("base64"),
      multiHeaders: { "Content-Type": { values: ["application/json"] } },
      cacheSettings: { store: false },
    })
    .result();
  if (!ok(response)) throw new Error("earn error");
  return JSON.parse(text(response));
}
