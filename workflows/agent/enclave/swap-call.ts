import { HTTPClient, type TeeRuntime, ok, text } from "@chainlink/cre-sdk";
import type { Config } from "../config.ts";

const http = new HTTPClient();

/** Circle's keyless swap service: the request names the vault, the tokens and the amount, which the swap publishes on chain a moment later anyway. */
export function circleQuote(runtime: TeeRuntime<Config>, body: string): unknown {
  const response = http
    .sendRequest(runtime, {
      url: `${runtime.config.swap.circleUrl}/v1/stablecoinKits/swap`,
      method: "POST",
      timeout: "30s",
      body: Buffer.from(body).toString("base64"),
      multiHeaders: { "Content-Type": { values: ["application/json"] } },
      cacheSettings: { store: false },
    })
    .result();
  if (!ok(response)) throw new Error("quote error");
  return JSON.parse(text(response));
}

export const chainOf = (config: Config): "Arc_Testnet" | "Arc" => (config.chainId === 5042 ? "Arc" : "Arc_Testnet");
