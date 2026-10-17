import { describe, expect, it } from "vitest";
import { deviationBps, expectedOut, fromUsdc, toUsdc } from "../src/valuation.ts";

const rate = { usdcUsd: 99_982_900n, eurcUsd: 112_136_087n }; // the real Arc mainnet answers read on 2026-10-16

describe("valuation", () => {
  it("values EURC in USDC with the two feeds, rounding down", () => {
    expect(toUsdc("EURC", 1_000_000n, rate)).toBe((1_000_000n * 112_136_087n) / 99_982_900n);
    expect(toUsdc("USDC", 1_234_567n, rate)).toBe(1_234_567n);
  });
  it("converts back with the inverse and never creates value", () => {
    for (const units of [1n, 999n, 1_000_000n, 123_456_789n, 10n ** 12n]) {
      expect(toUsdc("EURC", fromUsdc("EURC", units, rate), rate)).toBeLessThanOrEqual(units);
      expect(fromUsdc("USDC", units, rate)).toBe(units);
    }
  });
  it("says how far a quote is from the expected amount, in signed basis points", () => {
    expect(deviationBps(995_000n, 1_000_000n)).toBe(-50);
    expect(deviationBps(1_330_000n, 1_000_000n)).toBe(3_300);
    expect(deviationBps(1_000_000n, 1_000_000n)).toBe(0);
    expect(() => deviationBps(1n, 0n)).toThrow();
  });
  it("expects, for a swap, what the feeds say", () => {
    expect(expectedOut("USDC", 1_000_000_000n, rate)).toBe((1_000_000_000n * 99_982_900n) / 112_136_087n);
    expect(expectedOut("EURC", 1_000_000_000n, rate)).toBe((1_000_000_000n * 112_136_087n) / 99_982_900n);
  });
  it("rejects a zero or negative rate", () => {
    expect(() => toUsdc("EURC", 1n, { usdcUsd: 0n, eurcUsd: 1n })).toThrow(RangeError);
    expect(() => fromUsdc("EURC", 1n, { usdcUsd: 1n, eurcUsd: -1n })).toThrow(RangeError);
  });
});
