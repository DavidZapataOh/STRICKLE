import { allocatePayment, money } from "@strickle/core";
import { describe, expect, it } from "vitest";
import { cascadeSalaryOwed } from "../src/salary.ts";

const state = (salaryOwed: bigint) => ({
  asset: "USDC" as const, taxRateBps: 0, taxBufferBps: 10_500, payrollDue: 0n, payrollFunded: 0n,
  dailySpend: 0n, operatingBalance: 0n, salaryOwed, emergencyTarget: 0n, emergencyBalance: 0n,
});

describe("cascadeSalaryOwed", () => {
  it("is what the salary box still lacks, never negative", () => {
    expect(cascadeSalaryOwed(800n, 500n)).toBe(300n);
    expect(cascadeSalaryOwed(800n, 800n)).toBe(0n);
    expect(cascadeSalaryOwed(800n, 5_000n)).toBe(0n);
    expect(cascadeSalaryOwed(0n, 0n)).toBe(0n);
  });
  it("rejects negative amounts", () => {
    expect(() => cascadeSalaryOwed(-1n, 0n)).toThrow(RangeError);
    expect(() => cascadeSalaryOwed(1n, -1n)).toThrow(RangeError);
  });
  it("funds the salary box exactly once through the real cascade", () => {
    const owed = 800n;
    const box = 500n;
    const result = allocatePayment(money("USDC", 10_000n), state(cascadeSalaryOwed(owed, box)));
    expect(result.byBox.salary.units).toBe(300n);
    expect(box + result.byBox.salary.units).toBe(owed);
    expect(result.salaryPending.units).toBe(0n);
  });
  it("reports the part the cascade could not fund as its own pending, which decision.pending already contains", () => {
    const owed = 800n;
    const box = 500n;
    const result = allocatePayment(money("USDC", 100n), state(cascadeSalaryOwed(owed, box)));
    expect(result.byBox.salary.units).toBe(100n);
    expect(result.salaryPending.units).toBe(200n); // 300 lacked - 100 funded
    expect(owed - (box + result.byBox.salary.units)).toBe(result.salaryPending.units); // nothing is counted twice
  });
});
