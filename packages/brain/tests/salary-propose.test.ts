import { describe, expect, it } from "vitest";
import type { Forecast } from "../src/forecast.ts";
import { type SalaryDecision, monthsAboveTarget, proposeSalary, raisedSalary, salaryRaiseProposal } from "../src/salary.ts";

function forecastEnding(opening: bigint, p10Last: bigint, weeks: number): Forecast {
  const p10 = Array.from({ length: weeks }, (_, week) => (week === weeks - 1 ? p10Last : opening));
  return { asset: "USDC", weeks, scenarios: 1, openingBalance: opening, p50: p10, p10, paths: [p10] };
}

describe("proposeSalary", () => {
  it("is the monthly growth of the pessimistic path: 9,100 over 13 weeks is 3,000 a month", () => {
    expect(proposeSalary(forecastEnding(1_000n, 10_100n, 13))).toBe(3_000n);
  });
  it("scales with the number of weeks of the forecast", () => {
    expect(proposeSalary(forecastEnding(1_000n, 1_700n, 4))).toBe(750n); // 700 x 30 / 28
  });
  it("is 0 for a flat or shrinking pessimistic path, never negative", () => {
    expect(proposeSalary(forecastEnding(1_000n, 1_000n, 13))).toBe(0n);
    expect(proposeSalary(forecastEnding(1_000n, 400n, 13))).toBe(0n);
  });
  it("rejects a forecast with no weeks", () => {
    expect(() => proposeSalary({ ...forecastEnding(1n, 1n, 1), weeks: 0, p10: [] })).toThrow(RangeError);
  });
});

describe("raisedSalary", () => {
  it("adds the step, rounded down", () => {
    expect(raisedSalary(1_000n)).toBe(1_100n);
    expect(raisedSalary(15n)).toBe(16n); // 15 x 11000 / 10000 = 16.5
    expect(raisedSalary(1_000n, { raiseStepBps: 2_500 })).toBe(1_250n);
  });
  it("can equal the current salary when the step rounds away, and 0 stays 0", () => {
    expect(raisedSalary(3n)).toBe(3n);
    expect(raisedSalary(0n)).toBe(0n);
  });
});

describe("monthsAboveTarget", () => {
  const month = (operating: bigint) => ({ operating, target: 100n });
  it("counts consecutive months strictly above target, ending at the latest", () => {
    expect(monthsAboveTarget([month(101n), month(150n)])).toBe(2);
    expect(monthsAboveTarget([month(150n), month(100n), month(101n)])).toBe(1);
    expect(monthsAboveTarget([month(101n), month(90n)])).toBe(0);
    expect(monthsAboveTarget([])).toBe(0);
  });
});

const decision = (owed: bigint, payNow: bigint): SalaryDecision => ({
  owed, payNow, pending: owed - payNow, safeMax: payNow,
  ceilings: { box: 0n, cushion: 0n, scenarios: 0n },
  gates: { taxesCovered: true, historyOk: true, spendKnown: true },
  binding: payNow === owed ? "full" : "scenario-risk", breachBps: 0,
});

describe("salaryRaiseProposal", () => {
  it("proposes after two months above target when the raised salary is paid in full", () => {
    expect(salaryRaiseProposal({ current: 1_000n, monthsAboveTarget: 2, raisedDecision: decision(1_100n, 1_100n) })).toEqual({ propose: true, raised: 1_100n });
  });
  it("does not propose with one month, with a trimmed raised decision, or with a mismatched decision", () => {
    expect(salaryRaiseProposal({ current: 1_000n, monthsAboveTarget: 1, raisedDecision: decision(1_100n, 1_100n) }).propose).toBe(false);
    expect(salaryRaiseProposal({ current: 1_000n, monthsAboveTarget: 5, raisedDecision: decision(1_100n, 1_050n) }).propose).toBe(false);
    expect(() => salaryRaiseProposal({ current: 1_000n, monthsAboveTarget: 5, raisedDecision: decision(1_200n, 1_200n) })).toThrow(/raised/);
  });
  it("never proposes a raise that does not raise: zero or tiny current salary", () => {
    expect(salaryRaiseProposal({ current: 0n, monthsAboveTarget: 9, raisedDecision: decision(0n, 0n) }).propose).toBe(false);
    expect(salaryRaiseProposal({ current: 3n, monthsAboveTarget: 9, raisedDecision: decision(3n, 3n) }).propose).toBe(false);
  });
  it("honours custom months and step", () => {
    const policy = { raiseAfterMonths: 3, raiseStepBps: 2_000 };
    expect(salaryRaiseProposal({ current: 1_000n, monthsAboveTarget: 2, raisedDecision: decision(1_200n, 1_200n), policy }).propose).toBe(false);
    expect(salaryRaiseProposal({ current: 1_000n, monthsAboveTarget: 3, raisedDecision: decision(1_200n, 1_200n), policy })).toEqual({ propose: true, raised: 1_200n });
  });
});
