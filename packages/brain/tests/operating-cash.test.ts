import fc from "fast-check";
import { BOX_KINDS, allocatePayment, money } from "@strickle/core";
import { describe, expect, it } from "vitest";
import { SOFT_LOCK_SECONDS, agentMayMoveEmergencyTo, cascadeLiquidity, emergencySweep, emergencyTarget, emergencyUnlockAt, operatingStatus } from "../src/operating-cash.ts";

const spend = 10n; // floor 140, target 420

describe("operatingStatus", () => {
  it("is below the floor under 14 days of spend", () => {
    expect(operatingStatus(139n, spend)).toMatchObject({ floor: 140n, target: 420n, floorGap: 1n, targetGap: 281n, coverageDays: 13, level: "below-floor" });
  });
  it("is building exactly at the floor and until the target", () => {
    expect(operatingStatus(140n, spend)).toMatchObject({ floorGap: 0n, targetGap: 280n, coverageDays: 14, level: "building" });
    expect(operatingStatus(419n, spend)).toMatchObject({ floorGap: 0n, targetGap: 1n, coverageDays: 41, level: "building" });
  });
  it("is at target exactly at 42 days and above it", () => {
    expect(operatingStatus(420n, spend)).toMatchObject({ targetGap: 0n, coverageDays: 42, level: "at-target" });
    expect(operatingStatus(10_000n, spend)).toMatchObject({ floorGap: 0n, targetGap: 0n, coverageDays: 1_000, level: "at-target" });
  });
  it("never divides by zero: zero spend means floor and target 0, coverage unknown and at-target", () => {
    expect(operatingStatus(0n, 0n)).toMatchObject({ floor: 0n, target: 0n, coverageDays: null, level: "at-target" });
    expect(operatingStatus(500n, 0n).coverageDays).toBeNull();
  });
  it("honours a custom policy", () => {
    expect(operatingStatus(150n, spend, { floorDays: 10, targetDays: 20 })).toMatchObject({ floor: 100n, target: 200n, level: "building" });
  });
  it("accepts a floor equal to the target", () => {
    expect(() => operatingStatus(1n, spend, { floorDays: 5, targetDays: 5 })).not.toThrow();
  });
  it("rejects a floor above the target, non-positive or fractional days and negative amounts", () => {
    expect(() => operatingStatus(1n, spend, { floorDays: 30, targetDays: 20 })).toThrow(RangeError);
    expect(() => operatingStatus(1n, spend, { floorDays: 0 })).toThrow(RangeError);
    expect(() => operatingStatus(1n, spend, { targetDays: 1.5 })).toThrow(RangeError);
    expect(() => operatingStatus(-1n, spend)).toThrow(RangeError);
    expect(() => operatingStatus(1n, -1n)).toThrow(RangeError);
  });
});

describe("emergencyTarget", () => {
  it("is 30 days x months x spend, 3 months by default", () => {
    expect(emergencyTarget(spend)).toBe(900n);
    expect(emergencyTarget(spend, 6)).toBe(1_800n);
    expect(emergencyTarget(spend, 12)).toBe(3_600n);
    expect(emergencyTarget(0n)).toBe(0n);
  });
  it("rejects other month counts and a negative spend", () => {
    expect(() => emergencyTarget(spend, 4 as 3)).toThrow(RangeError);
    expect(() => emergencyTarget(-1n)).toThrow(RangeError);
  });
});

describe("emergencySweep", () => {
  const sweep = (operatingBalance: bigint, emergencyBalance: bigint) => emergencySweep({ operatingBalance, dailySpend: spend, emergencyBalance });

  it("moves nothing while operating cash is below or exactly at target", () => {
    expect(sweep(300n, 0n)).toEqual({ toEmergency: 0n, operatingAfter: 300n, emergencyAfter: 0n });
    expect(sweep(420n, 0n)).toEqual({ toEmergency: 0n, operatingAfter: 420n, emergencyAfter: 0n });
  });
  it("moves the whole excess when the fund's gap is larger", () => {
    expect(sweep(500n, 0n)).toEqual({ toEmergency: 80n, operatingAfter: 420n, emergencyAfter: 80n });
  });
  it("moves only the gap when the excess is larger", () => {
    expect(sweep(1_000n, 800n)).toEqual({ toEmergency: 100n, operatingAfter: 900n, emergencyAfter: 900n });
  });
  it("moves nothing when the fund is full or over", () => {
    expect(sweep(1_000n, 900n).toEmergency).toBe(0n);
    expect(sweep(1_000n, 5_000n).toEmergency).toBe(0n);
  });
  it("rejects negative balances", () => {
    expect(() => sweep(-1n, 0n)).toThrow(RangeError);
    expect(() => sweep(0n, -1n)).toThrow(RangeError);
  });
  it("conserves money and never exceeds the excess, the gap or the operating balance", () => {
    fc.assert(
      fc.property(fc.bigInt({ min: 0n, max: 5_000n }), fc.bigInt({ min: 0n, max: 5_000n }), fc.bigInt({ min: 0n, max: 100n }), (operating, emergency, dailySpend) => {
        const r = emergencySweep({ operatingBalance: operating, dailySpend, emergencyBalance: emergency });
        expect(r.operatingAfter + r.emergencyAfter).toBe(operating + emergency);
        expect(r.toEmergency).toBeGreaterThanOrEqual(0n);
        expect(r.toEmergency).toBeLessThanOrEqual(operating);
        expect(r.operatingAfter).toBeGreaterThanOrEqual(operating < 42n * dailySpend ? operating : 42n * dailySpend);
        expect(r.emergencyAfter).toBeLessThanOrEqual(emergency > 90n * dailySpend ? emergency : 90n * dailySpend);
      }),
      { numRuns: 200 },
    );
  });
});

describe("routing and the soft lock", () => {
  it("the agent never routes emergency money into the salary box, and may into every other box", () => {
    expect(agentMayMoveEmergencyTo("salary")).toBe(false);
    for (const box of BOX_KINDS.filter((b) => b !== "salary")) expect(agentMayMoveEmergencyTo(box)).toBe(true);
  });
  it("the soft lock opens 24 hours after the request", () => {
    expect(SOFT_LOCK_SECONDS).toBe(86_400);
    expect(emergencyUnlockAt(1_000)).toBe(87_400);
  });
  it("rejects a negative or fractional time", () => {
    expect(() => emergencyUnlockAt(-1)).toThrow(RangeError);
    expect(() => emergencyUnlockAt(1.5)).toThrow(RangeError);
  });
});

describe("cascadeLiquidity", () => {
  const liquidity = cascadeLiquidity({ dailySpend: spend, operatingBalance: 100n, emergencyBalance: 50n });
  const state = { asset: "USDC" as const, taxRateBps: 2_000, taxBufferBps: 10_500, payrollDue: 0n, payrollFunded: 0n, salaryOwed: 0n, ...liquidity };

  it("agrees with the status and the target computed here, and with the cascade's defaults", () => {
    expect(liquidity).toEqual({ dailySpend: 10n, operatingBalance: 100n, floorDays: 14, targetDays: 42, emergencyTarget: 900n, emergencyBalance: 50n });
  });
  it("is accepted by the real cascade: a payment first lifts operating to the floor, then the target", () => {
    const result = allocatePayment(money("USDC", 1_000n), state);
    expect(result.byBox.operating.units).toBe(320n); // 420 target - 100 balance
    expect(result.byBox.taxes.units).toBe(210n); // 20% x 1,000 x 1.05
  });
  it("uses the very defaults the cascade itself falls back to when the days are omitted", () => {
    const withoutDays = { ...state, floorDays: undefined, targetDays: undefined };
    expect(allocatePayment(money("USDC", 1_000n), withoutDays)).toEqual(allocatePayment(money("USDC", 1_000n), state));
  });
  it("respects a custom policy", () => {
    expect(cascadeLiquidity({ dailySpend: spend, operatingBalance: 0n, emergencyBalance: 0n, policy: { floorDays: 7, targetDays: 21, emergencyMonths: 6 } })).toMatchObject({ floorDays: 7, targetDays: 21, emergencyTarget: 1_800n });
  });
});

describe("the emergency fund against the real cascade", () => {
  it("grows only in rounds that leave operating cash at target (20 random payments, state carried forward)", () => {
    fc.assert(
      fc.property(fc.array(fc.bigInt({ min: 0n, max: 5_000n }), { minLength: 1, maxLength: 20 }), (payments) => {
        let operating = 0n;
        let emergency = 0n;
        for (const payment of payments) {
          const state = { asset: "USDC" as const, taxRateBps: 2_000, taxBufferBps: 10_500, payrollDue: 0n, payrollFunded: 0n, salaryOwed: 0n, ...cascadeLiquidity({ dailySpend: spend, operatingBalance: operating, emergencyBalance: emergency }) };
          const result = allocatePayment(money("USDC", payment), state);
          operating += result.byBox.operating.units;
          emergency += result.byBox.emergency.units;
          if (result.byBox.emergency.units > 0n) expect(operating).toBeGreaterThanOrEqual(420n);
        }
      }),
      { numRuns: 200 },
    );
  });
});
