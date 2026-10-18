import { plainDate } from "@strickle/core";
import { describe, expect, it } from "vitest";
import { earnAllowed } from "../enclave/earn-allowed.ts";
import { profileOf } from "./support.ts";

const today = plainDate(2026, 11, 1);
const zero = { taxes: 0n, payroll: 0n, salary: 0n, operating: 0n, emergency: 0n, profit: 0n };
const rich = { boxes: { ...zero, operating: 5_000_000_000n, emergency: 9_000_000_000n, profit: 4_000_000_000n }, invested: zero, unallocated: 0n };
const invested = { boxes: rich.boxes, invested: { ...zero, profit: 1_000_000_000n }, unallocated: 0n };
const move = (deposit: boolean, amount: bigint) => ({ deposit, box: "profit" as const, amount });

describe("whether the brain lets a move through", () => {
  it("allows putting some of a rich box to work and taking some of it back", () => {
    expect(earnAllowed(profileOf(), rich, today, move(true, 500_000_000n))).toBe(true);
    expect(earnAllowed(profileOf(), invested, today, move(false, 500_000_000n))).toBe(true);
  });

  it("lets a position that has earned be taken back whole, even though it is worth more than what went in", () => {
    // 1,000 went in and the position is worth 1,030 now: taking all of it back must never be refused for being larger than the principal
    expect(earnAllowed(profileOf(), invested, today, move(false, 1_030_000_000n))).toBe(true);
    expect(earnAllowed(profileOf(), rich, today, move(false, 1_000_000_000n))).toBe(true);
  });

  it("refuses to put to work more than the vault holds in cash", () => {
    expect(earnAllowed(profileOf(), rich, today, move(true, 99_000_000_000n))).toBe(false);
  });

  it("never refuses a withdrawal, not even from a tight account", () => {
    const due = profileOf({ payrolls: [["2026-11-02", "3000000000"]] });
    const tight = { boxes: { ...zero, payroll: 3_000_000_000n }, invested: { ...zero, payroll: 1n }, unallocated: 0n };
    expect(earnAllowed(due, tight, today, { deposit: false, box: "payroll", amount: 1n })).toBe(true);
  });

  it("refuses when the cash left would not cover the payroll due tomorrow, and allows it when it would", () => {
    const due = profileOf({ payrolls: [["2026-11-02", "3000000000"]] });
    const tight = { boxes: { ...zero, payroll: 3_000_000_000n }, invested: zero, unallocated: 0n };
    expect(earnAllowed(due, tight, today, { deposit: true, box: "payroll", amount: 1n })).toBe(false);
    const covered = { boxes: { ...zero, payroll: 3_000_000_000n, profit: 4_000_000_000n }, invested: zero, unallocated: 0n };
    expect(earnAllowed(due, covered, today, move(true, 500_000_000n))).toBe(true);
  });
});
