import { describe, expect, it } from "vitest";
import { fallbackReserve, loadRules, parseLocal, settleFallback } from "../src/index.ts";

const rule = loadRules(new URL("../rules", import.meta.url).pathname).find((r) => r.id === "fallback-effective-rate")!;
const m = parseLocal;
const reserve = (lastYearIncome: string, lastYearTax: string, yearToDate: string) =>
  fallbackReserve(rule, { lastYearIncome: m(lastYearIncome), lastYearTax: m(lastYearTax), yearToDate: m(yearToDate) });

describe("fallbackReserve", () => {
  it("is last year's effective rate times year-to-date income times 1.08", () => {
    expect(reserve("100000", "10000", "50000")).toBe(m("5400.00"));
  });
  it("rounds up so it never under-reserves", () => {
    expect(reserve("0.03", "0.01", "1.01")).toBe(m("0.37"));
  });
  it("reserves nothing when there is no income yet or no tax last year", () => {
    expect(reserve("100000", "10000", "0")).toBe(0n);
    expect(reserve("100000", "0", "50000")).toBe(0n);
  });
  it("rejects a zero prior-year income, which defines no rate", () => {
    expect(() => reserve("0", "0", "100")).toThrow(RangeError);
  });
  it("rejects negative amounts and a rule of another kind", () => {
    expect(() => fallbackReserve(rule, { lastYearIncome: 1n, lastYearTax: -1n, yearToDate: 0n })).toThrow(RangeError);
    expect(() => fallbackReserve({ ...rule, kind: "x" }, { lastYearIncome: 1n, lastYearTax: 0n, yearToDate: 0n })).toThrow(/kind/);
  });
});

describe("settleFallback", () => {
  it("returns the surplus as a refund", () => {
    expect(settleFallback({ reserved: m("5400"), actualTax: m("5000") })).toEqual({ refund: m("400"), shortfall: 0n });
  });
  it("reports a shortfall when the reserve was not enough", () => {
    expect(settleFallback({ reserved: m("5000"), actualTax: m("5400") })).toEqual({ refund: 0n, shortfall: m("400") });
  });
  it("settles exactly with neither", () => {
    expect(settleFallback({ reserved: 7n, actualTax: 7n })).toEqual({ refund: 0n, shortfall: 0n });
  });
});
