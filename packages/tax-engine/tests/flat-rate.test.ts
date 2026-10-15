import { plainDate } from "@strickle/core";
import { describe, expect, it } from "vitest";
import { estimateFlatRate, loadRules, parseLocal } from "../src/index.ts";

const rules = loadRules(new URL("../rules", import.meta.url).pathname);
const ph = rules.find((r) => r.id === "ph-eight-percent")!;
const pk = rules.find((r) => r.id === "pk-export-of-services")!;
const m = parseLocal;

const runPh = (receiptsToDate: string, paid = "0") => {
  const result = estimateFlatRate(ph, { option: "eight-percent", taxYear: 2026, receiptsToDate: m(receiptsToDate), paid: m(paid) });
  if (result.status !== "ok") throw new Error(result.reason);
  return result;
};

describe("estimateFlatRate: Philippines 8% option", () => {
  it("charges nothing up to the 250,000 allowance", () => {
    expect(runPh("250000.00").taxToDate).toBe(0n);
  });
  it("charges 8% of the excess, starting one centavo above the allowance", () => {
    expect(runPh("250000.01").taxToDate).toBe(m("0.00"));
    expect(runPh("250000.07").taxToDate).toBe(m("0.01"));
    expect(runPh("350000.00").taxToDate).toBe(m("8000.00"));
  });
  it("is payable net of what was already paid, never negative", () => {
    expect(runPh("350000.00", "3000.00").payable).toBe(m("5000.00"));
    expect(runPh("350000.00", "9000.00").payable).toBe(0n);
  });
  it("stays in regime at exactly 3,000,000.00 and leaves it one centavo above", () => {
    expect(runPh("3000000.00").status).toBe("ok");
    expect(estimateFlatRate(ph, { option: "eight-percent", taxYear: 2026, receiptsToDate: m("3000000.01"), paid: 0n })).toMatchObject({ status: "out-of-regime" });
  });
  it("lists the quarterly and annual dates of the tax year", () => {
    expect(runPh("0").dueDates).toEqual([
      { label: "Q1", date: plainDate(2026, 5, 15) },
      { label: "Q2", date: plainDate(2026, 8, 15) },
      { label: "Q3", date: plainDate(2026, 11, 15) },
      { label: "Annual", date: plainDate(2027, 4, 15) },
    ]);
    expect(runPh("0").withheldAtSource).toBe(false);
  });
});

describe("estimateFlatRate: Pakistan export of services", () => {
  const runPk = (option: string, receiptsToDate: string) => {
    const result = estimateFlatRate(pk, { option, taxYear: 2027, receiptsToDate: m(receiptsToDate), paid: 0n });
    if (result.status !== "ok") throw new Error(result.reason);
    return result;
  };
  it("charges 0.25% on PSEB-registered IT exports", () => {
    expect(runPk("pseb-it-exports", "1000000.00").taxToDate).toBe(m("2500.00"));
  });
  it("charges 1% on any other export", () => {
    expect(runPk("other-exports", "1000000.00").taxToDate).toBe(m("10000.00"));
  });
  it("is withheld at source, with no self-assessed dates", () => {
    const result = runPk("pseb-it-exports", "1000.00");
    expect(result.withheldAtSource).toBe(true);
    expect(result.dueDates).toEqual([]);
  });
});

describe("estimateFlatRate: validation", () => {
  it("rejects an unknown option, negative amounts and a rule of another kind", () => {
    const base = { taxYear: 2026, receiptsToDate: 0n, paid: 0n };
    expect(() => estimateFlatRate(ph, { ...base, option: "nope" })).toThrow(RangeError);
    expect(() => estimateFlatRate(ph, { ...base, option: "eight-percent", receiptsToDate: -1n })).toThrow(RangeError);
    expect(() => estimateFlatRate({ ...ph, kind: "x" }, { ...base, option: "eight-percent" })).toThrow(/kind/);
  });
});
