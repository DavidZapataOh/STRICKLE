import { plainDate } from "@strickle/core";
import { describe, expect, it } from "vitest";
import { loadRules, parseLocal, safeHarborPayments } from "../src/index.ts";

const rule = loadRules(new URL("../rules", import.meta.url).pathname).find((r) => r.id === "us-estimated-tax-safe-harbor")!;
const m = parseLocal;
const run = (input: { current: string; prior: string; agi: string; mfs?: boolean; credits?: string }) =>
  safeHarborPayments(rule, {
    expectedTax: m(input.current),
    priorYearTax: m(input.prior),
    priorYearAgi: m(input.agi),
    marriedFilingSeparately: input.mfs ?? false,
    withholdingAndCredits: m(input.credits ?? "0"),
  });
const amounts = (input: Parameters<typeof run>[0]) => run(input).installments.map((i) => i.amount);

describe("safeHarborPayments: required annual payment", () => {
  it("reproduces the Publication 505 example (110% of prior year is smaller)", () => {
    const result = run({ current: "71253", prior: "42581", agi: "180000" });
    expect(result.basis).toBe("prior-year-110");
    expect(result.requiredAnnual).toBe(m("46839.10"));
  });
  it("uses 90% of this year when it is smaller", () => {
    const result = run({ current: "10000", prior: "20000", agi: "50000" });
    expect(result.basis).toBe("current-year-90");
    expect(result.requiredAnnual).toBe(m("9000"));
  });
  it("uses 100% of last year when it is smaller and AGI is not above the threshold", () => {
    const result = run({ current: "20000", prior: "10000", agi: "50000" });
    expect(result.basis).toBe("prior-year-100");
    expect(result.requiredAnnual).toBe(m("10000"));
  });
  it("keeps 100% at prior AGI of exactly 150,000.00", () => {
    expect(run({ current: "20000", prior: "10000", agi: "150000.00" }).basis).toBe("prior-year-100");
  });
  it("switches to 110% at prior AGI of 150,000.01", () => {
    const result = run({ current: "20000", prior: "10000", agi: "150000.01" });
    expect(result.basis).toBe("prior-year-110");
    expect(result.requiredAnnual).toBe(m("11000"));
  });
  it("uses the 75,000 threshold when married filing separately", () => {
    expect(run({ current: "20000", prior: "10000", agi: "75000.00", mfs: true }).basis).toBe("prior-year-100");
    expect(run({ current: "20000", prior: "10000", agi: "75000.01", mfs: true }).basis).toBe("prior-year-110");
  });
  it("requires nothing when last year's tax was zero", () => {
    expect(run({ current: "5000", prior: "0", agi: "0" }).requiredAnnual).toBe(0n);
  });
});

describe("safeHarborPayments: installments", () => {
  it("splits into four equal payments (Publication 505: 1,800 gives 450)", () => {
    expect(amounts({ current: "2000", prior: "1800", agi: "50000" })).toEqual([m("450"), m("450"), m("450"), m("450")]);
  });
  it("lists the four 2026 due dates", () => {
    const dates = run({ current: "2000", prior: "1800", agi: "50000" }).installments.map((i) => i.dueDate);
    expect(dates).toEqual([plainDate(2026, 4, 15), plainDate(2026, 6, 15), plainDate(2026, 9, 15), plainDate(2027, 1, 15)]);
  });
  it("always sums to the amount to pay, putting leftover cents last", () => {
    expect(amounts({ current: "100.02", prior: "1000", agi: "1000" })).toEqual([2250n, 2250n, 2250n, 2252n]);
  });
  it("subtracts withholding and credits, never below zero", () => {
    expect(amounts({ current: "2000", prior: "1800", agi: "1", credits: "800" })).toEqual([m("250"), m("250"), m("250"), m("250")]);
    expect(amounts({ current: "2000", prior: "1800", agi: "1", credits: "5000" })).toEqual([0n, 0n, 0n, 0n]);
  });
});

describe("safeHarborPayments: validation", () => {
  const base = { priorYearAgi: 0n, marriedFilingSeparately: false, withholdingAndCredits: 0n };
  it("rejects negative amounts", () => {
    expect(() => safeHarborPayments(rule, { ...base, expectedTax: -1n, priorYearTax: 0n })).toThrow(RangeError);
    expect(() => safeHarborPayments(rule, { ...base, expectedTax: 0n, priorYearTax: -1n })).toThrow(RangeError);
  });
  it("rejects a rule of another kind", () => {
    expect(() => safeHarborPayments({ ...rule, kind: "x" }, { ...base, expectedTax: 0n, priorYearTax: 0n })).toThrow(/kind/);
  });
});
