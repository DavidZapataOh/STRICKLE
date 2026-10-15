import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { type Payable, decideEarlyPayments, earlyPaymentAprBps, fairDiscountBps, minDiscountBps, withEarlyPayments } from "../src/early-payment.ts";
import type { Forecast } from "../src/forecast.ts";

describe("earlyPaymentAprBps", () => {
  it("2/10 net 30 paid on day 10 (20 days gained) is 37.24% a year", () => {
    expect(earlyPaymentAprBps(200, 20)).toBe(3_724);
  });
  it("0.5% for 20 days gained is about 9% a year", () => {
    expect(earlyPaymentAprBps(50, 20)).toBe(917);
  });
  it("grows with the discount and shrinks with the days gained", () => {
    expect(earlyPaymentAprBps(300, 20)).toBeGreaterThan(earlyPaymentAprBps(200, 20));
    expect(earlyPaymentAprBps(200, 30)).toBeLessThan(earlyPaymentAprBps(200, 20));
  });
  it("rejects a discount of 0 or of 100% or more, and fewer than one day gained", () => {
    expect(() => earlyPaymentAprBps(0, 20)).toThrow(RangeError);
    expect(() => earlyPaymentAprBps(10_000, 20)).toThrow(RangeError);
    expect(() => earlyPaymentAprBps(1.5, 20)).toThrow(RangeError);
    expect(() => earlyPaymentAprBps(200, 0)).toThrow(RangeError);
    expect(() => earlyPaymentAprBps(200, 1.5)).toThrow(RangeError);
  });
});

describe("minDiscountBps", () => {
  it("against a 4.5% vault the minimum discount at 20 days is 0.25%", () => {
    expect(minDiscountBps(450, 0, 20)).toBe(25);
  });
  it("adding the 3% margin raises it to 0.41%", () => {
    expect(minDiscountBps(450, 300, 20)).toBe(41);
  });
  it("is the discount at which the APR just clears yield plus margin", () => {
    const d = minDiscountBps(450, 300, 20);
    expect(earlyPaymentAprBps(d, 20)).toBeGreaterThan(750);
    expect(earlyPaymentAprBps(d - 1, 20)).toBeLessThanOrEqual(750);
  });
  it("rejects negative rates and fewer than one day", () => {
    expect(() => minDiscountBps(-1, 0, 20)).toThrow(RangeError);
    expect(() => minDiscountBps(450, -1, 20)).toThrow(RangeError);
    expect(() => minDiscountBps(450, 0, 0)).toThrow(RangeError);
  });
});

describe("fairDiscountBps", () => {
  it("splits the surplus between the two: d = D/365 x (r_v + k_s)/2", () => {
    expect(fairDiscountBps(450, 1_800, 20)).toBe(62);
  });
  it("equals the vault's gain when the supplier's cost of money is the same", () => {
    expect(fairDiscountBps(450, 450, 20)).toBe(25); // 20 x 450 / 365 = 24.66 -> 25
  });
  it("rejects negative rates and fewer than one day", () => {
    expect(() => fairDiscountBps(-1, 1_800, 20)).toThrow(RangeError);
    expect(() => fairDiscountBps(450, -1, 20)).toThrow(RangeError);
    expect(() => fairDiscountBps(450, 1_800, 0)).toThrow(RangeError);
  });
});

/** `scenarios` paths of `weeks` weeks at a constant balance, with `dips` scenarios that drop to `depth` at week `at`. */
function forecastOf(opening: bigint, options: { scenarios?: number; weeks?: number; dips?: number; depth?: bigint; at?: number } = {}): Forecast {
  const { scenarios = 200, weeks = 13, dips = 0, depth = 0n, at = 1 } = options;
  const paths = Array.from({ length: scenarios }, (_, s) => Array.from({ length: weeks }, (_, w) => (s < dips && w === at ? depth : opening)));
  return { asset: "USDC", weeks, scenarios, openingBalance: opening, p50: [], p10: [], paths };
}

const payable = (id: string, over: Partial<Payable> = {}): Payable => ({ id, amount: 1_000n, discountBps: 200, daysToDiscountEnd: 5, daysToDue: 20, ...over });
const policy = { vaultYieldBps: 450 };
const spend = 100n; // floor = 14 x 100 = 1,400

describe("withEarlyPayments", () => {
  it("lowers the balance by the net amount until the due week and raises it by the discount from then on", () => {
    const f: Forecast = { asset: "USDC", weeks: 4, scenarios: 1, openingBalance: 100n, p50: [], p10: [], paths: [[90n, 80n, 70n, 60n]] };
    const adjusted = withEarlyPayments(f, [{ net: 30n, discount: 5n, daysToDue: 10 }]); // due in week index 1
    expect(adjusted.openingBalance).toBe(70n);
    expect(adjusted.paths).toEqual([[60n, 85n, 75n, 65n]]);
  });
  it("adds several invoices and never mutates its input", () => {
    const f = forecastOf(1_000n, { weeks: 3, scenarios: 1 });
    // first invoice: net 10, discount 1, due in week 0; second: net 20, discount 2, due in week 2
    const adjusted = withEarlyPayments(f, [{ net: 10n, discount: 1n, daysToDue: 1 }, { net: 20n, discount: 2n, daysToDue: 15 }]);
    expect(adjusted.openingBalance).toBe(970n);
    expect(adjusted.paths).toEqual([[981n, 981n, 1_003n]]);
    expect(f.paths[0]).toEqual([1_000n, 1_000n, 1_000n]);
  });
});

describe("decideEarlyPayments: which invoices clear the bar", () => {
  it("pays the good one and says why each other one was rejected, always with its APR", () => {
    const result = decideEarlyPayments(
      [payable("A"), payable("B", { discountBps: 10, daysToDue: 30 }), payable("D", { daysToDiscountEnd: -1 }), payable("E", { daysToDue: 0 })],
      forecastOf(10_000n), spend, policy,
    );
    expect(result.chosen).toEqual([{ id: "A", net: 980n, discount: 20n, aprBps: 3_724, benefit: 18n }]);
    expect(result.rejected).toEqual([
      { id: "B", aprBps: 122, reason: "apr-below-yield-plus-margin" },
      { id: "D", aprBps: 3_724, reason: "discount-expired" },
      { id: "E", aprBps: null, reason: "due-too-soon" },
    ]);
    expect(result.totalNet).toBe(980n);
    expect(result.breachBps).toBe(0);
  });
  it("an APR exactly at yield plus margin is not enough", () => {
    const margin = 300;
    const d = 100; // choose an invoice whose APR we then set the yield to
    const apr = decideEarlyPayments([payable("X", { discountBps: d, daysToDue: 20 })], forecastOf(10_000n), spend, { vaultYieldBps: 0, marginBps: 0 }).chosen[0]!.aprBps;
    const atBar = decideEarlyPayments([payable("X", { discountBps: d, daysToDue: 20 })], forecastOf(10_000n), spend, { vaultYieldBps: apr - margin, marginBps: margin });
    expect(atBar.chosen).toEqual([]);
    expect(atBar.rejected[0]).toMatchObject({ reason: "apr-below-yield-plus-margin" });
  });
  it("pays nothing when there are no invoices", () => {
    expect(decideEarlyPayments([], forecastOf(10_000n), spend, policy)).toEqual({ chosen: [], rejected: [], totalNet: 0n, breachBps: 0 });
  });
});

describe("decideEarlyPayments: liquidity", () => {
  it("refuses an invoice that would leave the cushion under its floor in the scenarios", () => {
    const result = decideEarlyPayments([payable("C", { amount: 2_000n })], forecastOf(3_000n), spend, policy); // 3,000 - 1,960 = 1,040 < 1,400
    expect(result.chosen).toEqual([]);
    expect(result.rejected).toEqual([{ id: "C", aprBps: 3_724, reason: "liquidity-risk" }]);
  });
  it("accepts exactly four breaching scenarios of 200 (2%) and refuses five", () => {
    const four = decideEarlyPayments([payable("A")], forecastOf(10_000n, { dips: 4, depth: 1_500n }), spend, policy);
    expect(four.chosen.map((c) => c.id)).toEqual(["A"]);
    expect(four.breachBps).toBe(200);
    const five = decideEarlyPayments([payable("A")], forecastOf(10_000n, { dips: 5, depth: 1_500n }), spend, policy);
    expect(five.chosen).toEqual([]);
    expect(five.rejected[0]).toMatchObject({ reason: "liquidity-risk" });
  });
  it("a dip after the due week does not count against paying early (the baseline would have paid by then)", () => {
    const late = decideEarlyPayments([payable("A")], forecastOf(10_000n, { dips: 200, depth: 1_500n, at: 3 }), spend, policy);
    expect(late.chosen.map((c) => c.id)).toEqual(["A"]);
  });
});

describe("decideEarlyPayments: the best set under the limit", () => {
  const items = [payable("P", { amount: 3_000n }), payable("Q", { amount: 2_000n }), payable("R", { amount: 1_800n })];
  it("when two fit alone but not together, keeps the one with the larger benefit", () => {
    const result = decideEarlyPayments(items, forecastOf(5_000n), spend, policy); // room for 3,600 of net
    expect(result.chosen.map((c) => c.id)).toEqual(["P"]);
    expect(result.chosen[0]).toMatchObject({ net: 2_940n, discount: 60n, benefit: 53n });
    expect(result.rejected).toEqual([{ id: "Q", aprBps: 3_724, reason: "not-selected" }, { id: "R", aprBps: 3_724, reason: "not-selected" }]);
  });
  it("takes all of them when there is room", () => {
    const result = decideEarlyPayments(items, forecastOf(20_000n), spend, policy);
    expect(result.chosen.map((c) => c.id).sort()).toEqual(["P", "Q", "R"]);
  });
  it("on equal benefit prefers fewer invoices (one of 1,960 beats two of 980)", () => {
    // no yield, so the benefit is the discount: C alone is 40, A plus B is 20 + 20
    const tie = [payable("A", { amount: 1_000n }), payable("B", { amount: 1_000n }), payable("C", { amount: 2_000n })];
    const result = decideEarlyPayments(tie, forecastOf(3_360n), spend, { vaultYieldBps: 0, marginBps: 0 }); // room for exactly 1,960 of net
    expect(result.chosen.map((c) => c.id)).toEqual(["C"]);
  });
  it("the exact search beats the greedy one: the highest-APR invoice is not always in the best set", () => {
    // A has the best APR (10%) but a benefit of 100; B (5%, benefit 150) does not fit with A; the greedy choice A + C is worth 140, the optimum B alone is worth 150
    const items = [payable("A", { amount: 1_000n, discountBps: 1_000 }), payable("B", { amount: 3_000n, discountBps: 500 }), payable("C", { amount: 2_000n, discountBps: 200 })];
    const result = decideEarlyPayments(items, forecastOf(4_400n), spend, { vaultYieldBps: 0, marginBps: 0 }); // room for 3,000 of net
    expect(result.chosen.map((c) => c.id)).toEqual(["B"]);
    expect(result.chosen[0]).toMatchObject({ net: 2_850n, discount: 150n, benefit: 150n });
  });
  it("honours a cap on the total paid", () => {
    const result = decideEarlyPayments([payable("A"), payable("B")], forecastOf(20_000n), spend, { ...policy, maxTotalNet: 1_000n });
    expect(result.chosen).toHaveLength(1);
    expect(result.totalNet).toBeLessThanOrEqual(1_000n);
  });
  it("uses the greedy path above 12 eligible invoices and still respects the limit", () => {
    const many = Array.from({ length: 14 }, (_, i) => payable(`I${String(i).padStart(2, "0")}`, { amount: 1_000n, discountBps: 200 + i }));
    const result = decideEarlyPayments(many, forecastOf(3_500n), spend, policy); // room for 2,100: two invoices
    expect(result.chosen).toHaveLength(2);
    expect(result.chosen.map((c) => c.id)).toEqual(["I13", "I12"]); // highest APR first
    expect(result.totalNet).toBeLessThanOrEqual(2_100n);
  });
  it("is the same whatever the order of the invoices (property)", () => {
    fc.assert(fc.property(fc.shuffledSubarray(items, { minLength: 1 }), (subset) => {
      const a = decideEarlyPayments(items, forecastOf(5_000n), spend, policy);
      const b = decideEarlyPayments([...subset, ...items.filter((i) => !subset.includes(i))].reverse(), forecastOf(5_000n), spend, policy);
      expect(b.chosen).toEqual(a.chosen);
      expect(b.totalNet).toBe(a.totalNet);
    }), { numRuns: 100 });
  });
  it("finds 12 eligible invoices quickly (exact search)", () => {
    const twelve = Array.from({ length: 12 }, (_, i) => payable(`J${i}`, { amount: 500n + BigInt(i) * 10n }));
    const runs: number[] = [];
    for (let i = 0; i < 5; i++) {
      const start = performance.now();
      decideEarlyPayments(twelve, forecastOf(6_000n), spend, policy);
      runs.push(performance.now() - start);
    }
    runs.sort((a, b) => a - b);
    expect(runs[2]).toBeLessThan(250);
  });
});

describe("decideEarlyPayments: validation", () => {
  it("rejects bad invoices, a negative spend and a bad policy", () => {
    const f = forecastOf(10_000n);
    expect(() => decideEarlyPayments([payable("A", { amount: 0n })], f, spend, policy)).toThrow(RangeError);
    expect(() => decideEarlyPayments([payable("A", { discountBps: 0 })], f, spend, policy)).toThrow(RangeError);
    expect(() => decideEarlyPayments([payable("A", { daysToDue: -1 })], f, spend, policy)).toThrow(RangeError);
    expect(() => decideEarlyPayments([payable("A"), payable("A")], f, spend, policy)).toThrow(/duplicate/);
    expect(() => decideEarlyPayments([payable("A")], f, -1n, policy)).toThrow(RangeError);
    expect(() => decideEarlyPayments([payable("A")], f, spend, { vaultYieldBps: -1 })).toThrow(RangeError);
    expect(() => decideEarlyPayments([payable("A")], f, spend, { ...policy, epsilonBps: 10_000 })).toThrow(RangeError);
  });
});
