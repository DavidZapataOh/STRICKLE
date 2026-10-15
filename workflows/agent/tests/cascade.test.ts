// workflows/agent/tests/cascade.test.ts
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { BOX_ID, planSplit } from "../enclave/cascade.ts";
import { type Profile, profileSchema } from "../enclave/profile.ts";

const live: Profile = {
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
};
const empty = { asset: "USDC" as const, unallocated: 1_000_000n, operating: 0n, payrollFunded: 0n, emergency: 0n };

describe("planSplit", () => {
  it("fills the operating floor and target first, then profit", () => {
    const plan = planSplit(live, empty);
    expect(plan.boxes).toEqual([BOX_ID.operating, BOX_ID.profit]);
    expect(plan.amounts).toEqual([840_000n, 160_000n]);
  });

  it("reserves taxes before anything else", () => {
    const plan = planSplit({ ...live, taxRateBps: 2_000 }, empty);
    expect(plan.boxes[0]).toBe(BOX_ID.taxes);
    expect(plan.amounts[0]).toBe(210_000n);
  });

  it("carries the unpaid salary into the next profile", () => {
    const plan = planSplit({ ...live, salaryOwed: "5000000" }, empty);
    expect(plan.next.salaryOwed).toBe("4280000");
  });

  it("leaves an unrelated profile field untouched", () => {
    expect(planSplit(live, empty).next).toEqual(live);
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
    .filter((profile) => profileSchema.safeParse(profile).success);
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
        const plan = planSplit(profile, books);
        expect(plan.amounts.reduce((sum, amount) => sum + amount, 0n)).toBe(books.unallocated);
        expect(plan.boxes.every((box, index) => box >= 1 && box <= 6 && (index === 0 || box > plan.boxes[index - 1]))).toBe(true);
        expect(plan.amounts.every((amount) => amount > 0n)).toBe(true);
        expect(profileSchema.safeParse(plan.next).success).toBe(true);
        expect(BigInt(plan.next.salaryOwed)).toBeLessThanOrEqual(BigInt(profile.salaryOwed));
      }),
    );
  });
});
