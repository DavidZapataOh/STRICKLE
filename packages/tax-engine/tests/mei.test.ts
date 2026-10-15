import { plainDate } from "@strickle/core";
import { describe, expect, it } from "vitest";
import { estimateMei, loadRules, parseLocal } from "../src/index.ts";

const rule = loadRules(new URL("../rules", import.meta.url).pathname).find((r) => r.id === "br-mei")!;
const m = parseLocal;
const none = { icms: false, iss: false, carrier: false };
const run = (activity: Partial<typeof none>, annualRevenue = "0", period = { year: 2026, month: 10 }) => {
  const result = estimateMei(rule, { annualRevenue: m(annualRevenue), activity: { ...none, ...activity }, period });
  if (result.status !== "ok") throw new Error(result.reason);
  return result;
};

describe("estimateMei: monthly DAS by activity", () => {
  it.each([
    ["INSS only", {}, "81.05"],
    ["commerce or industry (ICMS)", { icms: true }, "82.05"],
    ["services (ISS)", { iss: true }, "86.05"],
    ["commerce and services", { icms: true, iss: true }, "87.05"],
    ["cargo carrier", { carrier: true }, "194.52"],
    ["cargo carrier with ICMS", { carrier: true, icms: true }, "195.52"],
    ["cargo carrier with ISS", { carrier: true, iss: true }, "199.52"],
    ["cargo carrier with both", { carrier: true, icms: true, iss: true }, "200.52"],
  ])("%s pays %s", (_name, activity, das) => {
    expect(run(activity).das).toBe(m(das));
  });
});

describe("estimateMei: due date", () => {
  it("is the 20th of the month after the period", () => {
    expect(run({}, "0", { year: 2026, month: 1 }).dueDate).toEqual(plainDate(2026, 2, 20));
  });
  it("rolls December into January of the next year", () => {
    expect(run({}, "0", { year: 2026, month: 12 }).dueDate).toEqual(plainDate(2027, 1, 20));
  });
});

describe("estimateMei: annual cap", () => {
  it("stays in regime at exactly 81,000.00 with no headroom", () => {
    expect(run({}, "81000.00").headroom).toBe(0n);
  });
  it("reports headroom under the cap", () => {
    expect(run({}, "80999.99").headroom).toBe(1n);
  });
  it("is out of regime one centavo above the cap", () => {
    expect(estimateMei(rule, { annualRevenue: m("81000.01"), activity: none, period: { year: 2026, month: 10 } })).toMatchObject({ status: "out-of-regime" });
  });
});

describe("estimateMei: validation", () => {
  const base = { activity: none, period: { year: 2026, month: 10 } };
  it("rejects negative revenue", () => {
    expect(() => estimateMei(rule, { ...base, annualRevenue: -1n })).toThrow(RangeError);
  });
  it("rejects a rule of another kind", () => {
    expect(() => estimateMei({ ...rule, kind: "x" }, { ...base, annualRevenue: 0n })).toThrow(/kind/);
  });
});
