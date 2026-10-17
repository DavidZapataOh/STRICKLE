import { readFileSync } from "node:fs";
import { type BoxKind, plainDate } from "@strickle/core";
import { describe, expect, it } from "vitest";
import type { SwapConfig } from "../config.ts";
import { convert } from "../enclave/swap-handle.ts";
import { profileOf } from "./support.ts";

const mainnet = JSON.parse(readFileSync(new URL("./fixtures/swap/swap-mainnet.json", import.meta.url), "utf8"));
const VAULT = "0x8AB41267Adc223EF245c46537870Ae8744b9b3F8";
const USDC = "0x3600000000000000000000000000000000000000";
const EURC = "0xbEf5f6d51CB62b58e6A8f77868681825C6fe21c1";
const ADAPTER = "0xBBD70b01a1CAbc96d5b7b129Ae1AAabdf50dd40b";
const rate = { usdcUsd: 99_982_900n, eurcUsd: 112_353_511n };
const config: SwapConfig = { circleUrl: "https://api.circle.com", adapter: ADAPTER, usdcFeed: "0x00000000000000000000000000000000000000f1", eurcFeed: "0x00000000000000000000000000000000000000f2", gas: "1500000", minUnits: "1", dailyCap: "5000000000", maxSlipBps: 100, ceilingBps: 200, sandboxFx: false, maxFeedAgeSeconds: 93_600 };
const TODAY = plainDate(2026, 11, 10);
const deadline = Number(mainnet.transaction.executionParams.deadline);
const NOW = deadline - 540;
const zero = (): Record<BoxKind, bigint> => ({ taxes: 0n, payroll: 0n, salary: 0n, operating: 0n, emergency: 0n, profit: 0n });
const holdings = (usdc: Partial<Record<BoxKind, bigint>> = {}) => ({ usdc: { ...zero(), ...usdc }, eurc: zero() });
const euroPayroll = (over = {}) => profileOf({ currencies: { payroll: "EUR", operating: "USD", emergency: "USD", profit: "USD" }, ...over });
const run = (over: { slippageBps?: number; allowed?: (intent: unknown) => boolean; profile?: ReturnType<typeof profileOf>; rate?: typeof rate | "stale"; adapter?: { address: string; from: bigint }; quote?: (body: string) => unknown; raw?: ReturnType<typeof holdings> } = {}) =>
  convert({
    profile: over.profile ?? euroPayroll(),
    vault: VAULT,
    swap: { raw: over.raw ?? holdings({ payroll: 1_000_000n }), rate: over.rate ?? rate, adapter: (over.adapter ?? { address: ADAPTER, from: 1_000n }) as { address: `0x${string}`; from: bigint }, slippageBps: over.slippageBps ?? 100 },
    allowed: over.allowed,
    today: TODAY,
    now: NOW,
    config,
    usdc: USDC,
    eurc: EURC,
    chain: "Arc",
    quote: over.quote ?? (() => mainnet),
  });

describe("convert", () => {
  it("turns an accepted answer into a swap report with the new counters and a notice with the real numbers", () => {
    const result = run();
    if (result.kind !== "swap") throw new Error(result.kind);
    expect(result.intent).toMatchObject({ box: 2, boxKind: "payroll", assetIn: "USDC", amountIn: 1_000_000n });
    expect(result.seen).toBe(1_000_000n);
    expect(result.data.startsWith("0xaa3e079c")).toBe(true);
    expect(result.gasLimit).toBe(1_500_000n);
    expect(result.next.swap).toMatchObject({ day: "2026-11-10", spent: "1000000", failures: 0 });
    expect(result.next.rate).toEqual({ usdcUsd: "99982900", eurcUsd: "112353511", at: NOW });
    expect(result.notices).toHaveLength(1);
    expect(result.notices[0]).toMatchObject({ kind: "swap", box: "payroll", from: "USDC", amountIn: "1000000", estimatedOut: mainnet.estimatedAmount, feeBps: 2 });
    expect(result.failed.next.swap.failures).toBe(1);
    expect(result.failed.notices[0]).toMatchObject({ kind: "swap-held", reason: "vault-refused" });
  });

  it("does nothing when nothing needs converting, without asking Circle", () => {
    let asked = false;
    const result = run({ profile: profileOf(), raw: holdings({ payroll: 1_000_000n }), quote: () => { asked = true; return mainnet; } });
    expect(result.kind).toBe("none");
    expect(asked).toBe(false);
  });

  it("holds, counts a failure and says why when the answer fails a check", () => {
    const bad = JSON.parse(JSON.stringify(mainnet));
    bad.transaction.executionParams.tokens[0].beneficiary = "0x00000000000000000000000000000000000000ee";
    const result = run({ quote: () => bad });
    if (result.kind !== "held") throw new Error(result.kind);
    expect(result.next.swap.failures).toBe(1);
    expect(result.notices).toEqual([{ kind: "swap-held", box: "payroll", reason: "invalid-quote" }]);
  });

  it("counts a failure when Circle cannot be reached", () => {
    const result = run({ quote: () => { throw new Error("rpc error"); } });
    if (result.kind !== "held") throw new Error(result.kind);
    expect(result.next.swap.failures).toBe(1);
    expect(result.notices[0]).toMatchObject({ reason: "quote-unavailable" });
  });

  it("says a held reason once a day, not every run", () => {
    const first = run({ quote: () => { throw new Error("down"); } });
    if (first.kind !== "held") throw new Error(first.kind);
    const again = run({ profile: first.next, quote: () => { throw new Error("down"); } });
    if (again.kind !== "held") throw new Error(again.kind);
    expect(again.next.swap.failures).toBe(2);
    expect(again.notices).toEqual([]);
  });

  it("skips and says so once a day when a feed is stale, never touching the failure count", () => {
    const first = run({ rate: "stale" });
    if (first.kind !== "held") throw new Error(first.kind);
    expect(first.notices).toEqual([{ kind: "swap-held", box: "payroll", reason: "stale-feed" }]);
    expect(first.next.swap.failures).toBe(0);
    const second = run({ rate: "stale", profile: first.next });
    expect(second.kind).toBe("none");
  });

  it("waits for the adapter's day: not set, another adapter, or not yet effective all hold without a failure", () => {
    for (const adapter of [{ address: "0x0000000000000000000000000000000000000000", from: 0n }, { address: "0x00000000000000000000000000000000000000ad", from: 1_000n }, { address: ADAPTER, from: BigInt(NOW + 60) }]) {
      const result = run({ adapter });
      if (result.kind !== "held") throw new Error(result.kind);
      expect(result.notices[0]).toMatchObject({ reason: "adapter-not-approved" });
      expect(result.next.swap.failures).toBe(0);
    }
  });

  it("says once that three failures stopped the conversions, and nothing more that day", () => {
    const third = run({ profile: euroPayroll({ swap: { day: "", spent: "0", failures: 2, since: "", heldOn: "2026-11-10" } }), quote: () => { throw new Error("down"); } });
    if (third.kind !== "held") throw new Error(third.kind);
    expect(third.notices).toEqual([{ kind: "swap-held", box: "payroll", reason: "failures" }]);
    expect(third.next.swap.failures).toBe(3);
    expect(run({ profile: third.next }).kind).toBe("none");
  });

  it("gives the breaker a fresh start the next day instead of switching conversions off for good", () => {
    const yesterday = euroPayroll({ swap: { day: "", spent: "0", failures: 3, since: "", heldOn: "2026-11-09" } });
    const result = run({ profile: yesterday });
    expect(result.kind).toBe("swap");
  });

  it("says nothing about an adapter the user never approved when they never declared euros", () => {
    const result = run({ profile: profileOf(), raw: { usdc: zero(), eurc: { ...zero(), taxes: 900_000_000n } }, adapter: { address: "0x0000000000000000000000000000000000000000", from: 0n } });
    expect(result.kind).toBe("none");
  });

  it("asks for no looser a minimum than the vault's own, tighter, slippage would accept", () => {
    const loose = run();
    const tight = run({ slippageBps: 10 });
    if (loose.kind !== "swap" || tight.kind !== "swap") throw new Error("expected swaps");
    expect(tight.intent.minOut).toBeGreaterThan(loose.intent.minOut);
  });

  it("bounds the gas it passes on to a small multiple of its own", () => {
    const wild = JSON.parse(JSON.stringify(mainnet));
    wild.transaction.gasLimit = "0xffffffffff";
    const result = run({ quote: () => wild });
    if (result.kind !== "swap") throw new Error(result.kind);
    expect(result.gasLimit).toBe(3_000_000n);
  });

  it("lets the brain's invariants stop a conversion before Circle is asked", () => {
    let asked = false;
    const result = run({ allowed: () => false, quote: () => { asked = true; return mainnet; } });
    expect(result.kind).toBe("none");
    expect(asked).toBe(false);
  });

  it("says the daily cap is used, once", () => {
    const capped = run({ profile: euroPayroll({ swap: { day: "2026-11-10", spent: "5000000000", failures: 0, since: "", heldOn: "" } }) });
    if (capped.kind !== "held") throw new Error(capped.kind);
    expect(capped.notices).toEqual([{ kind: "swap-held", box: "payroll", reason: "daily-cap" }]);
  });
});
