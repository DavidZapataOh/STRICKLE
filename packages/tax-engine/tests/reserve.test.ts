import { plainDate } from "@strickle/core";
import { describe, expect, it } from "vitest";
import { coverage, loadRules, parseLocal, reserveFor, type ReserveRequest } from "../src/index.ts";

const rules = loadRules(new URL("../rules", import.meta.url).pathname);
const m = parseLocal;
const today = plainDate(2026, 10, 15);
const base = { today, yearToDate: m("50000"), lastYear: { income: m("100000"), tax: m("10000") } };
const request = (country: string, regime?: ReserveRequest["regime"]): ReserveRequest => ({ ...base, country, regime });

describe("reserveFor: rule origin", () => {
  it("MX RESICO: ISR plus VAT due", () => {
    const result = reserveFor(rules, request("MX", { kind: "resico-monthly", input: { period: { year: 2026, month: 10 }, collected: m("100000"), yearToDate: m("100000") } }));
    expect(result).toMatchObject({ origin: "rule", ruleId: "mx-resico-pf", amount: m("2000.00") + m("16000.00") });
  });
  it("AR monotributo: the category fee", () => {
    const result = reserveFor(rules, request("AR", { kind: "monotributo-monthly", input: { annualIncome: m("30000000"), activity: "services", period: { year: 2026, month: 10 } } }));
    expect(result).toMatchObject({ origin: "rule", amount: m("84612.93") });
  });
  it("CO SIMPLE: the bimester advance", () => {
    const result = reserveFor(rules, request("CO", { kind: "simple-bimonthly", input: { annualIncome: m("400000000"), bimester: 5, bimesterIncome: m("10000000") } }));
    expect(result).toMatchObject({ origin: "rule", amount: m("730000.00") });
  });
  it("BR MEI: the DAS", () => {
    const result = reserveFor(rules, request("BR", { kind: "mei-monthly", input: { annualRevenue: m("1000"), activity: { icms: false, iss: true, carrier: false }, period: { year: 2026, month: 10 } } }));
    expect(result).toMatchObject({ origin: "rule", amount: m("86.05") });
  });
  it("US: the next installment on or after today", () => {
    const regime = { kind: "safe-harbor-quarterly" as const, input: { expectedTax: m("100.02"), priorYearTax: m("1000"), priorYearAgi: m("50000"), marriedFilingSeparately: false, withholdingAndCredits: 0n } };
    expect(reserveFor(rules, { ...request("US", regime), today: plainDate(2026, 9, 15) })).toMatchObject({ origin: "rule", amount: m("22.50") });
    expect(reserveFor(rules, { ...request("US", regime), today: plainDate(2026, 9, 16) })).toMatchObject({ origin: "rule", amount: m("22.52") });
  });
  it("PH: the payable tax to date", () => {
    const result = reserveFor(rules, request("PH", { kind: "flat-rate-receipts", input: { option: "eight-percent", taxYear: 2026, receiptsToDate: m("350000"), paid: 0n } }));
    expect(result).toMatchObject({ origin: "rule", amount: m("8000.00") });
  });
  it("carries the rule's visible source and verification status", () => {
    const result = reserveFor(rules, request("PH", { kind: "flat-rate-receipts", input: { option: "eight-percent", taxYear: 2026, receiptsToDate: 0n, paid: 0n } }));
    expect(result.source.url).toMatch(/^https:\/\/bir-cdn\.bir\.gov\.ph/);
    expect(result).toMatchObject({ country: "PH", verification: { status: "unverified" } });
  });
});

describe("reserveFor: fallback origin", () => {
  it("uses last year's effective rate x year-to-date x 1.08 for a country without rules", () => {
    const result = reserveFor(rules, request("NG"));
    expect(result).toMatchObject({ origin: "fallback", reason: "no-rule", amount: m("5400.00"), ruleId: "fallback-effective-rate" });
    expect(result.source.title).toMatch(/not an official/i);
  });
  it("falls back when the country's rule has expired", () => {
    expect(reserveFor(rules, { ...request("MX"), today: plainDate(2027, 6, 1) })).toMatchObject({ origin: "fallback", reason: "rule-expired" });
  });
  it("falls back when the regime inputs are missing", () => {
    expect(reserveFor(rules, request("MX"))).toMatchObject({ origin: "fallback", reason: "regime-input-missing" });
  });
  it("falls back when the regime inputs are for another kind", () => {
    const wrong = { kind: "flat-rate-receipts" as const, input: { option: "eight-percent", taxYear: 2026, receiptsToDate: 0n, paid: 0n } };
    expect(reserveFor(rules, request("MX", wrong))).toMatchObject({ origin: "fallback", reason: "regime-input-missing" });
  });
  it("falls back when the income is out of the regime", () => {
    const result = reserveFor(rules, request("BR", { kind: "mei-monthly", input: { annualRevenue: m("81000.01"), activity: { icms: false, iss: false, carrier: false }, period: { year: 2026, month: 10 } } }));
    expect(result).toMatchObject({ origin: "fallback", reason: "out-of-regime" });
  });
});

describe("coverage", () => {
  it("lists countries with a current rule and those on the fallback", () => {
    expect(coverage(rules, today)).toEqual({ withRule: ["AR", "BR", "CO", "MX", "PH", "PK", "US"], expired: [] });
    expect(coverage(rules, plainDate(2027, 6, 1))).toEqual({ withRule: ["PK"], expired: ["AR", "BR", "CO", "MX", "PH", "US"] });
  });
});
