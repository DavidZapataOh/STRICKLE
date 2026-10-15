import { describe, expect, it } from "vitest";
import { earlyPaymentAprBps, fairDiscountBps, minDiscountBps } from "../src/early-payment.ts";

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
