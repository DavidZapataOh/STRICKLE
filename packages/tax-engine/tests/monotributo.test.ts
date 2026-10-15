import { plainDate } from "@strickle/core";
import { describe, expect, it } from "vitest";
import { estimateMonotributo, loadRules, parseLocal } from "../src/index.ts";

const rule = loadRules(new URL("../rules", import.meta.url).pathname).find((r) => r.id === "ar-monotributo")!;
const m = parseLocal;
const run = (annualIncome: string, activity: "services" | "goods" = "services") => {
  const result = estimateMonotributo(rule, { annualIncome: m(annualIncome), activity, period: { year: 2026, month: 10 } });
  if (result.status !== "ok") throw new Error(result.reason);
  return result;
};

describe("estimateMonotributo: category by income", () => {
  it.each([
    ["0", "A"],
    ["12009410.45", "A"],
    ["12009410.46", "B"],
    ["17595182.74", "B"],
    ["17595182.75", "C"],
    ["30628651.43", "D"],
    ["45151659.42", "G"],
    ["105012519.20", "J"],
    ["126610838.75", "K"],
  ])("annual income %s is category %s", (income, category) => {
    expect(run(income).category).toBe(category);
  });
});

describe("estimateMonotributo: fee and due date", () => {
  it("charges the services fee of category D", () => {
    expect(run("30000000").fee).toBe(m("84612.93"));
  });
  it("charges the goods fee of category D", () => {
    expect(run("30000000", "goods").fee).toBe(m("82564.81"));
  });
  it("charges the same A fee for both activities", () => {
    expect(run("1000").fee).toBe(m("49527.18"));
    expect(run("1000", "goods").fee).toBe(m("49527.18"));
  });
  it("is due on the 20th of the same month", () => {
    expect(run("1000").dueDate).toEqual(plainDate(2026, 10, 20));
  });
});

describe("estimateMonotributo: headroom and limits", () => {
  it("reports what is left under the category cap", () => {
    expect(run("12000000").headroom).toBe(m("9410.45"));
  });
  it("has no headroom left beyond the cap of the category the income sits in", () => {
    expect(run("12009410.45").headroom).toBe(0n);
  });
  it("is out of regime above category K", () => {
    expect(estimateMonotributo(rule, { annualIncome: m("126610838.76"), activity: "services", period: { year: 2026, month: 10 } })).toMatchObject({ status: "out-of-regime" });
  });
  it("rejects negative income and a rule of another kind", () => {
    expect(() => estimateMonotributo(rule, { annualIncome: -1n, activity: "services", period: { year: 2026, month: 10 } })).toThrow(RangeError);
    expect(() => estimateMonotributo({ ...rule, kind: "x" }, { annualIncome: 0n, activity: "services", period: { year: 2026, month: 10 } })).toThrow(/kind/);
  });
});
