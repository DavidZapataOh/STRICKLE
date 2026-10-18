import { addDays, isoWeekday, plainDate } from "@strickle/core";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { type Obligation, businessDaysBefore, investableNow, redemptionsDue } from "../src/yield-budget.ts";

const M = 1_000_000n;
const today = plainDate(2026, 11, 2); // a Monday
const due = (days: number, amount: bigint, box: Obligation["box"] = "profit"): Obligation => ({ box, due: addDays(today, days), amount });

describe("businessDaysBefore", () => {
  it("steps back over weekdays only", () => {
    expect(businessDaysBefore(plainDate(2026, 11, 11), 5)).toEqual(plainDate(2026, 11, 4)); // Wednesday back to the Wednesday before
    expect(businessDaysBefore(plainDate(2026, 11, 9), 1)).toEqual(plainDate(2026, 11, 6)); // Monday back over the weekend to Friday
    expect(businessDaysBefore(plainDate(2026, 11, 7), 5)).toEqual(plainDate(2026, 11, 2)); // a Saturday: the Monday of that week
    expect(businessDaysBefore(plainDate(2026, 11, 11), 0)).toEqual(plainDate(2026, 11, 11));
  });

  it("never lands on a weekend and is never later than the date (property)", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 4000 }), fc.integer({ min: 1, max: 30 }), (offset, count) => {
        const date = addDays(plainDate(2026, 1, 1), offset);
        const back = businessDaysBefore(date, count);
        expect(isoWeekday(back)).toBeLessThanOrEqual(5);
        expect(back.year * 10_000 + back.month * 100 + back.day).toBeLessThan(date.year * 10_000 + date.month * 100 + date.day);
      }),
    );
  });
});

describe("investableNow", () => {
  const base = { box: "profit" as const, liquid: 10_000n * M, invested: 0n, floor: 0n, obligations: [] as Obligation[], today, maxInvestBps: 10_000 };

  it("is everything above the floor when nothing is due", () => {
    expect(investableNow({ ...base, floor: 1_000n * M })).toBe(9_000n * M);
  });

  it("leaves out what is due within sixty days, and counts a payment on day sixty but not on day sixty-one", () => {
    expect(investableNow({ ...base, obligations: [due(60, 4_000n * M)] })).toBe(6_000n * M);
    expect(investableNow({ ...base, obligations: [due(61, 4_000n * M)] })).toBe(10_000n * M);
  });

  it("counts a payment already past due, and ignores other boxes", () => {
    expect(investableNow({ ...base, obligations: [due(-3, 2_000n * M), due(10, 1_000n * M, "taxes")] })).toBe(8_000n * M);
  });

  it("is bounded by the box's investable share counting what already works, taxes at 50%", () => {
    expect(investableNow({ ...base, box: "taxes", liquid: 1_000n * M, invested: 0n, maxInvestBps: 5_000 })).toBe(500n * M);
    expect(investableNow({ ...base, box: "taxes", liquid: 500n * M, invested: 500n * M, maxInvestBps: 5_000 })).toBe(0n);
    expect(investableNow({ ...base, box: "taxes", liquid: 600n * M, invested: 400n * M, maxInvestBps: 5_000 })).toBe(100n * M);
  });

  it("is zero when the need is larger than the money, and never negative", () => {
    expect(investableNow({ ...base, obligations: [due(5, 99_000n * M)] })).toBe(0n);
    expect(investableNow({ ...base, liquid: 0n })).toBe(0n);
  });

  it("never lets the box fall under what it needs, and never rises with a bigger obligation (property)", () => {
    fc.assert(
      fc.property(fc.bigInt({ min: 0n, max: 100_000n * M }), fc.bigInt({ min: 0n, max: 50_000n * M }), fc.bigInt({ min: 0n, max: 50_000n * M }), fc.integer({ min: 0, max: 10_000 }), (liquid, need, extra, bps) => {
        const small = investableNow({ ...base, liquid, maxInvestBps: bps, obligations: [due(30, need)] });
        const large = investableNow({ ...base, liquid, maxInvestBps: bps, obligations: [due(30, need + extra)] });
        expect(small).toBeGreaterThanOrEqual(0n);
        expect(large).toBeLessThanOrEqual(small);
        expect(liquid - small).toBeGreaterThanOrEqual(need < liquid ? need : liquid);
      }),
    );
  });
});

describe("redemptionsDue", () => {
  const base = { box: "profit" as const, liquid: 0n, invested: 10_000n * M, obligations: [] as Obligation[], today };

  it("is zero when the cash covers the payments inside the lead window", () => {
    expect(redemptionsDue({ ...base, liquid: 2_000n * M, obligations: [due(3, 2_000n * M)] })).toBe(0n);
  });

  it("brings back the shortfall plus one percent for a payment inside the window", () => {
    expect(redemptionsDue({ ...base, liquid: 500n * M, obligations: [due(3, 2_000n * M)] })).toBe(1_515n * M);
  });

  it("does nothing for a payment that is further away than the lead", () => {
    // due in 14 days: the window opens five business days before, which is still ahead of today
    expect(redemptionsDue({ ...base, obligations: [due(14, 2_000n * M)] })).toBe(0n);
  });

  it("opens the window five business days before, so a payment next Monday is in it already", () => {
    expect(redemptionsDue({ ...base, obligations: [due(7, 1_000n * M)] })).toBe(1_010n * M);
  });

  it("adds two payments in the window and covers them once", () => {
    expect(redemptionsDue({ ...base, liquid: 1_000n * M, obligations: [due(2, 1_500n * M), due(4, 1_500n * M)] })).toBe(2_020n * M);
  });

  it("can use the part of the position that has earned, up to what it is worth", () => {
    expect(redemptionsDue({ ...base, invested: 1_000n * M, worth: 1_200n * M, obligations: [due(1, 1_100n * M)] })).toBe(1_111n * M);
    expect(redemptionsDue({ ...base, invested: 1_000n * M, worth: 1_200n * M, obligations: [due(1, 5_000n * M)] })).toBe(1_200n * M);
  });

  it("asks for the whole shortfall for a payment that is past due, and is capped by what is invested", () => {
    expect(redemptionsDue({ ...base, obligations: [due(-2, 1_000n * M)] })).toBe(1_010n * M);
    expect(redemptionsDue({ ...base, invested: 300n * M, obligations: [due(1, 1_000n * M)] })).toBe(300n * M);
  });

  it("ignores payments of other boxes and rounds up so a payment is never underfunded (property)", () => {
    expect(redemptionsDue({ ...base, obligations: [due(1, 1_000n * M, "taxes")] })).toBe(0n);
    fc.assert(
      fc.property(fc.bigInt({ min: 0n, max: 10_000n * M }), fc.bigInt({ min: 1n, max: 10_000n * M }), fc.bigInt({ min: 0n, max: 100_000n * M }), (liquid, amount, invested) => {
        const redeemed = redemptionsDue({ ...base, liquid, invested, obligations: [due(1, amount)] });
        expect(redeemed).toBeLessThanOrEqual(invested);
        if (invested >= (amount > liquid ? amount - liquid : 0n) * 101n / 100n) expect(liquid + redeemed).toBeGreaterThanOrEqual(amount);
      }),
    );
  });
});
