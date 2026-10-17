import { readFileSync } from "node:fs";
import { encodeAbiParameters } from "viem";
import { describe, expect, it } from "vitest";
import { decodeRate, feedRequests, storedRate } from "../enclave/fx.ts";
import { profileOf } from "./support.ts";

const feeds = JSON.parse(readFileSync(new URL("./fixtures/swap/feeds-mainnet.json", import.meta.url), "utf8"));
const USDC_FEED = "0x84EA90AC252Dc437031461836DB5164219147905";
const EURC_FEED = "0x361b95c10b76Ca3f35C686d423e43A951755Bf23";
const answer = (value: bigint, updatedAt: bigint) => encodeAbiParameters([{ type: "uint80" }, { type: "int256" }, { type: "uint256" }, { type: "uint256" }, { type: "uint80" }], [1n, value, updatedAt, updatedAt, 1n]);

describe("feedRequests", () => {
  it("asks both feeds for their latest round at the latest block", () => {
    const [usdc, eurc] = feedRequests(USDC_FEED, EURC_FEED);
    expect(usdc?.method).toBe("eth_call");
    expect((usdc?.params[0] as { to: string }).to).toBe(USDC_FEED);
    expect((eurc?.params[0] as { to: string }).to).toBe(EURC_FEED);
    expect((usdc?.params[0] as { data: string }).data.startsWith("0xfeaf968c")).toBe(true);
  });
});

describe("decodeRate", () => {
  it("decodes the two real mainnet answers", () => {
    expect(decodeRate([feeds.usdc, feeds.eurc], feeds.readAt, 26 * 3600)).toEqual({ usdcUsd: 99_982_900n, eurcUsd: 112_353_511n });
  });
  it("is stale when either answer is older than the limit", () => {
    expect(decodeRate([feeds.usdc, feeds.eurc], feeds.readAt + 26 * 3600 + 60_000, 26 * 3600)).toBe("stale");
    expect(decodeRate([answer(100_000_000n, 1_000n), answer(110_000_000n, 90_000n)], 100_000, 3_600)).toBe("stale");
  });
  it("treats a feed stamped in the future as stale", () => {
    expect(decodeRate([answer(100_000_000n, 5_000n), answer(110_000_000n, 5_000n)], 1_000, 3_600)).toBe("stale");
  });
  it("throws on a zero or negative answer", () => {
    expect(() => decodeRate([answer(0n, 1_000n), answer(110_000_000n, 1_000n)], 1_100, 3_600)).toThrow();
    expect(() => decodeRate([answer(100_000_000n, 1_000n), answer(-1n, 1_000n)], 1_100, 3_600)).toThrow();
  });
});

describe("storedRate", () => {
  const profile = (rate: { usdcUsd: string; eurcUsd: string; at: number }) => profileOf({ rate });
  it("is the last rate the agent stored while it is at most seven days old", () => {
    expect(storedRate(profile({ usdcUsd: "100000000", eurcUsd: "112000000", at: 1_000_000 }), 1_000_000 + 7 * 86_400)).toEqual({ usdcUsd: 100_000_000n, eurcUsd: 112_000_000n });
  });
  it("is nothing when it is older, never stored, or zero", () => {
    expect(storedRate(profile({ usdcUsd: "100000000", eurcUsd: "112000000", at: 1_000_000 }), 1_000_000 + 7 * 86_400 + 1)).toBeUndefined();
    expect(storedRate(profile({ usdcUsd: "0", eurcUsd: "0", at: 0 }), 1_000)).toBeUndefined();
  });
});
