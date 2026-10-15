import { plainDate } from "@strickle/core";
import { describe, expect, it } from "vitest";
import { estimateResico, loadRules, parseLocal } from "../src/index.ts";

const rule = loadRules(new URL("../rules", import.meta.url).pathname).find((r) => r.id === "mx-resico-pf")!;
const m = parseLocal;
const base = { period: { year: 2026, month: 10 }, yearToDate: 0n };

const estimate = (collected: string, extra: Partial<Parameters<typeof estimateResico>[1]> = {}) => {
  const result = estimateResico(rule, { ...base, collected: m(collected), ...extra });
  if (result.status !== "ok") throw new Error(result.reason);
  return result;
};

describe("estimateResico: monthly ISR table", () => {
  it.each([
    ["0", "0"],
    ["20000", "200"],
    ["25000", "250"],
    ["25000.01", "275"],
    ["50000", "550"],
    ["50000.01", "750"],
    ["83333.33", "1250"],
    ["83333.34", "1666.67"],
    ["100000", "2000"],
    ["208333.33", "4166.67"],
    ["208333.34", "5208.33"],
    ["300000", "7500"],
  ])("collected %s pays ISR %s", (collected, isr) => {
    expect(estimate(collected).isr).toBe(m(isr));
  });
});

describe("estimateResico: withholdings and credit", () => {
  it("subtracts the ISR already withheld", () => {
    const result = estimate("100000", { isrWithheld: m("1250") });
    expect(result.isrDue).toBe(m("750"));
    expect(result.isrCredit).toBe(0n);
  });

  it("never goes negative: the excess becomes a credit", () => {
    const result = estimate("20000", { isrWithheld: m("1000") });
    expect(result.isrDue).toBe(0n);
    expect(result.isrCredit).toBe(m("800"));
  });

  it("computes the 1.25% a company would withhold on a payment", () => {
    expect(estimate("100000").expectedCompanyWithholding).toBe(m("1250"));
  });
});

describe("estimateResico: VAT", () => {
  it("charges 16% and nets creditable and withheld VAT", () => {
    const result = estimate("100000", { vatCreditable: m("3000"), vatWithheld: m("2000") });
    expect(result.vatCharged).toBe(m("16000"));
    expect(result.vatDue).toBe(m("11000"));
    expect(result.vatCredit).toBe(0n);
  });

  it("carries a VAT credit when creditable plus withheld exceed what was charged", () => {
    const result = estimate("10000", { vatCreditable: m("2000") });
    expect(result.vatDue).toBe(0n);
    expect(result.vatCredit).toBe(m("400"));
  });
});

describe("estimateResico: due date and limits", () => {
  it("is the 17th of the following month", () => {
    expect(estimate("1000").dueDate).toEqual(plainDate(2026, 11, 17));
    expect(estimateResico(rule, { ...base, period: { year: 2026, month: 12 }, collected: m("1000") })).toMatchObject({ dueDate: plainDate(2027, 1, 17) });
  });

  it("is out of regime above the annual cap", () => {
    const result = estimateResico(rule, { ...base, collected: m("1000"), yearToDate: m("3500000.01") });
    expect(result).toMatchObject({ status: "out-of-regime" });
  });

  it("stays in regime exactly at the cap", () => {
    expect(estimateResico(rule, { ...base, collected: m("1000"), yearToDate: m("3500000") }).status).toBe("ok");
  });

  it("is out of regime when one month exceeds the table", () => {
    expect(estimateResico(rule, { ...base, collected: m("3500000.01") }).status).toBe("out-of-regime");
  });

  it("rejects a rule of another kind", () => {
    expect(() => estimateResico({ ...rule, kind: "other" }, { ...base, collected: 0n })).toThrow(/kind/);
  });
});
