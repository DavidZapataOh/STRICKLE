import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { YIELD_FEE_BPS, gainOf, shouldInvite, yieldFee } from "../src/yield-fee.ts";

describe("the yield fee", () => {
  it("is ten percent of the gain, rounded down", () => {
    expect(YIELD_FEE_BPS).toBe(1_000);
    expect(yieldFee(1_000_000n)).toEqual({ fee: 100_000n, net: 900_000n });
    expect(yieldFee(9n)).toEqual({ fee: 0n, net: 9n });
    expect(yieldFee(0n)).toEqual({ fee: 0n, net: 0n });
  });

  it("never takes more than the gain and always adds up (property)", () => {
    fc.assert(
      fc.property(fc.bigInt({ min: 0n, max: 10n ** 24n }), (gain) => {
        const { fee, net } = yieldFee(gain);
        expect(fee + net).toBe(gain);
        expect(fee * 10n).toBeLessThanOrEqual(gain);
        expect(fee * 10n + 9n).toBeGreaterThanOrEqual(gain);
      }),
    );
  });

  it("is the same in two partial withdrawals as in the whole, within one unit (property)", () => {
    fc.assert(
      fc.property(fc.bigInt({ min: 0n, max: 10n ** 18n }), fc.bigInt({ min: 0n, max: 10n ** 18n }), (a, b) => {
        const parts = yieldFee(a).fee + yieldFee(b).fee;
        const whole = yieldFee(a + b).fee;
        expect(whole - parts).toBeLessThanOrEqual(1n);
        expect(whole - parts).toBeGreaterThanOrEqual(0n);
      }),
    );
  });
});

describe("gainOf", () => {
  it("is what came back above the principal, and zero for a loss", () => {
    expect(gainOf(1_030_000n, 1_000_000n)).toBe(30_000n);
    expect(gainOf(1_000_000n, 1_000_000n)).toBe(0n);
    expect(gainOf(990_000n, 1_000_000n)).toBe(0n);
  });
});

describe("shouldInvite", () => {
  const base = { enabled: false, invitedOn: "", historyDays: 28, apyBps: 420 };
  it("is true once, for an account with yield off, enough history and an observed rate", () => {
    expect(shouldInvite(base)).toBe(true);
  });
  it("is false with yield on, after an invitation, with too little history or without a rate", () => {
    expect(shouldInvite({ ...base, enabled: true })).toBe(false);
    expect(shouldInvite({ ...base, invitedOn: "2026-11-01" })).toBe(false);
    expect(shouldInvite({ ...base, historyDays: 27 })).toBe(false);
    expect(shouldInvite({ ...base, apyBps: null })).toBe(false);
    expect(shouldInvite({ ...base, apyBps: 0 })).toBe(false);
  });
});
