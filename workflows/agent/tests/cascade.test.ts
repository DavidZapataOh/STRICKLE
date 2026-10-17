// workflows/agent/tests/cascade.test.ts
import { plainDate } from "@strickle/core";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { BOX_ID, allocateAmount, planSplit } from "../enclave/cascade.ts";
import { profileSchema } from "../enclave/profile.ts";

const live = profileSchema.parse({
  version: 1,
  taxRateBps: 0,
  taxBufferBps: 10_500,
  payrollShareBps: 10_000,
  floorDays: 14,
  targetDays: 42,
  dailySpend: "20000",
  payrollDue: "0",
  salaryOwed: "0",
  emergencyTarget: "0",
});
const today = plainDate(2026, 11, 1);
const empty = { asset: "USDC" as const, unallocated: 1_000_000n, operating: 0n, payrollFunded: 0n, emergency: 0n };

describe("planSplit", () => {
  it("fills the operating floor and target first, then profit", () => {
    const plan = planSplit(live, empty, today);
    expect(plan.boxes).toEqual([BOX_ID.operating, BOX_ID.profit]);
    expect(plan.amounts).toEqual([840_000n, 160_000n]);
  });

  it("reserves taxes before anything else", () => {
    const plan = planSplit({ ...live, taxRateBps: 2_000 }, empty, today);
    expect(plan.boxes[0]).toBe(BOX_ID.taxes);
    expect(plan.amounts[0]).toBe(210_000n);
  });

  it("carries the unpaid salary into the next profile", () => {
    const plan = planSplit({ ...live, salaryOwed: "5000000" }, empty, today);
    expect(plan.next.salaryOwed).toBe("4280000");
  });

  it("leaves an unrelated profile field untouched", () => {
    expect({ ...planSplit(live, empty, today).next, history: live.history, salaryOwed: live.salaryOwed }).toEqual(live);
  });

  const profileArb = fc
    .record({
      version: fc.constant(1 as const),
      taxRateBps: fc.integer({ min: 0, max: 10_000 }),
      taxBufferBps: fc.integer({ min: 10_500, max: 11_000 }),
      payrollShareBps: fc.integer({ min: 0, max: 10_000 }),
      floorDays: fc.integer({ min: 0, max: 100 }),
      targetDays: fc.integer({ min: 100, max: 365 }),
      dailySpend: fc.bigInt({ min: 0n, max: 10n ** 9n }).map(String),
      payrollDue: fc.bigInt({ min: 0n, max: 10n ** 12n }).map(String),
      salaryOwed: fc.bigInt({ min: 0n, max: 10n ** 12n }).map(String),
      emergencyTarget: fc.bigInt({ min: 0n, max: 10n ** 12n }).map(String),
    })
    .filter((profile) => profileSchema.safeParse(profile).success)
    .map((profile) => profileSchema.parse(profile));
  const booksArb = fc.record({
    asset: fc.constantFrom("USDC" as const, "EURC" as const),
    unallocated: fc.bigInt({ min: 1n, max: 10n ** 12n }),
    operating: fc.bigInt({ min: 0n, max: 10n ** 12n }),
    payrollFunded: fc.bigInt({ min: 0n, max: 10n ** 12n }),
    emergency: fc.bigInt({ min: 0n, max: 10n ** 12n }),
  });

  it("allocates exactly the payment, on ascending valid boxes, whatever the profile", () => {
    fc.assert(
      fc.property(profileArb, booksArb, (profile, books) => {
        const plan = planSplit(profile, books, today);
        expect(plan.amounts.reduce((sum, amount) => sum + amount, 0n)).toBe(books.unallocated);
        expect(plan.boxes.every((box, index) => box >= 1 && box <= 6 && (index === 0 || box > plan.boxes[index - 1]))).toBe(true);
        expect(plan.amounts.every((amount) => amount > 0n)).toBe(true);
        expect(profileSchema.safeParse(plan.next).success).toBe(true);
        expect(BigInt(plan.next.salaryOwed)).toBeLessThanOrEqual(BigInt(profile.salaryOwed));
      }),
    );
  });
});

describe("planSplit history", () => {
  it("records the deposit as an inflow dated today", () => {
    expect(planSplit(live, empty, today).next.history.at(-1)).toEqual(["2026-11-01", "1000000", "deposit"]);
  });

  it("drops entries older than 91 days", () => {
    const old = { ...live, history: [["2026-07-01", "5", "deposit"], ["2026-10-20", "7", "deposit"]] as [string, string, string][] };
    const history = planSplit(old, empty, today).next.history;
    expect(history.map((entry) => entry[0])).toEqual(["2026-10-20", "2026-11-01"]);
  });

  it("keeps at most 200 entries, dropping the oldest", () => {
    const crowded = { ...live, history: Array.from({ length: 200 }, (_, i) => ["2026-10-20", String(i + 1), "deposit"] as [string, string, string]) };
    const history = planSplit(crowded, empty, today).next.history;
    expect(history).toHaveLength(200);
    expect(history[0][1]).toBe("2");
    expect(history.at(-1)?.[1]).toBe("1000000");
  });
});

describe("allocateAmount", () => {
  const taxed = { ...live, taxRateBps: 2_000 };
  it("reserves taxes only for income, and everything else is allocated the same way", () => {
    const income = allocateAmount(taxed, empty, 1_000_000n, { income: true });
    const own = allocateAmount(taxed, empty, 1_000_000n, { income: false });
    expect(income.byBox.taxes.units).toBeGreaterThan(0n);
    expect(own.byBox.taxes.units).toBe(0n);
    const sum = (r: typeof income) => Object.values(r.byBox).reduce((total, m) => total + m.units, 0n);
    expect(sum(income)).toBe(1_000_000n);
    expect(sum(own)).toBe(1_000_000n);
  });
  it("is what planSplit uses for income, so nothing that worked before changes", () => {
    const direct = allocateAmount(taxed, empty, empty.unallocated, { income: true });
    const plan = planSplit(taxed, empty, today);
    const fromDirect = Object.entries(direct.byBox).filter(([, m]) => m.units > 0n).map(([kind, m]) => [BOX_ID[kind as keyof typeof BOX_ID], m.units]);
    expect(plan.boxes.map((box, index) => [box, plan.amounts[index]])).toEqual(fromDirect);
  });
});
