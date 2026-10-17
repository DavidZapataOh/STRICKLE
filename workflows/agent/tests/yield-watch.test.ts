import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { observe, watchStep } from "../enclave/yield-watch.ts";
import { profileOf } from "./support.ts";

const list = JSON.parse(readFileSync(new URL("./fixtures/earn/vaults.json", import.meta.url), "utf8"));
const EARN = "0xAabbeF1D3971c710276ed41eC791BbE14CdB8E88";
const vaults = [{ address: EARN }];
const prices = { [EARN.toLowerCase()]: 1_001_058n };

describe("observe", () => {
  it("reads the rate, the status and the liquidity from Circle's real list and the price from the chain", () => {
    expect(observe({ vaults, sharePrices: prices, list })).toEqual([{ id: EARN.toLowerCase(), price: 1_001_058n, apyBps: 420, active: true, liquidity: 1_000_000_000_000n }]);
  });

  it("gives nothing for a vault the list does not carry or whose price is unknown", () => {
    expect(observe({ vaults: [{ address: "0x00000000000000000000000000000000000000d9" }], sharePrices: {}, list })).toEqual([]);
    expect(observe({ vaults, sharePrices: {}, list })).toEqual([]);
  });

  it("gives nothing, and does not throw, for a list it cannot read, and keeps the vaults that are readable", () => {
    for (const bad of [null, {}, "nope", { data: { vaults: "x" } }]) expect(observe({ vaults, sharePrices: prices, list: bad })).toEqual([]);
    const mixed = { data: { vaults: [{ junk: true }, ...list.data.vaults] } };
    expect(observe({ vaults, sharePrices: prices, list: mixed })).toHaveLength(1);
  });

  it("reads an inactive vault as inactive", () => {
    const paused = structuredClone(list);
    for (const entry of paused.data.vaults) entry.status = "paused";
    expect(observe({ vaults, sharePrices: prices, list: paused })[0]?.active).toBe(false);
  });
});

describe("watchStep", () => {
  const now = (price: bigint, over: Record<string, unknown> = {}) => [{ id: EARN.toLowerCase(), price, apyBps: 420, active: true, liquidity: 1_000_000_000_000n, ...over }];

  it("records the first observation and flags nothing", () => {
    const result = watchStep({ profile: profileOf(), now: now(1_001_058n), positions: { [EARN.toLowerCase()]: 5n }, nowSeconds: 1_790_000_000 });
    expect(result.anomalies).toEqual([]);
    expect(result.next.yieldWatch).toEqual({ at: 1_790_000_000, vaults: [{ id: EARN.toLowerCase(), price: "1001058", apyBps: 420, active: true }] });
  });

  it("flags a price drop against the stored observation and records the new one", () => {
    const first = watchStep({ profile: profileOf(), now: now(1_001_058n), positions: {}, nowSeconds: 1 });
    const second = watchStep({ profile: first.next, now: now(980_000n), positions: { [EARN.toLowerCase()]: 5n }, nowSeconds: 2 });
    expect(second.anomalies).toEqual([{ id: EARN.toLowerCase(), reason: "price-drop" }]);
    expect(second.next.yieldWatch.vaults[0]?.price).toBe("980000");
  });

  it("stores a new observation once a day, so a quiet hour costs no report", () => {
    const first = watchStep({ profile: profileOf(), now: now(1_001_058n), positions: {}, nowSeconds: 1_790_000_000 });
    const sameDay = watchStep({ profile: first.next, now: now(1_001_100n), positions: {}, nowSeconds: 1_790_000_000 + 3_600 });
    expect(sameDay.next).toBe(first.next);
    const nextDay = watchStep({ profile: first.next, now: now(1_001_200n), positions: {}, nowSeconds: 1_790_000_000 + 90_000 });
    expect(nextDay.next.yieldWatch.vaults[0]?.price).toBe("1001200");
  });

  it("still stores an observation, and flags the vault, the moment something is wrong", () => {
    const first = watchStep({ profile: profileOf(), now: now(1_001_058n), positions: {}, nowSeconds: 1_790_000_000 });
    const bad = watchStep({ profile: first.next, now: now(900_000n), positions: {}, nowSeconds: 1_790_000_000 + 60 });
    expect(bad.anomalies).toHaveLength(1);
    expect(bad.next.yieldWatch.vaults[0]?.price).toBe("900000");
  });

  it("keeps the previous observation when this run saw nothing, so a gap never hides a drop", () => {
    const first = watchStep({ profile: profileOf(), now: now(1_001_058n), positions: {}, nowSeconds: 1 });
    const blind = watchStep({ profile: first.next, now: [], positions: {}, nowSeconds: 2 });
    expect(blind.next.yieldWatch).toEqual(first.next.yieldWatch);
  });
});
