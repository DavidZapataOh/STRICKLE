import { plainDate } from "@strickle/core";
import { describe, expect, it } from "vitest";
import { RuleError, isCurrent, parseRule } from "../src/index.ts";

const valid = {
  id: "mx-resico-pf",
  country: "MX",
  regime: "RESICO persona física",
  kind: "monthly-income-tax",
  version: "2026.1",
  validFrom: "2026-01-01",
  validTo: "2026-12-31",
  source: { title: "SAT, Régimen Simplificado de Confianza", url: "https://www.sat.gob.mx/", retrievedOn: "2026-10-01" },
  verification: "unverified",
  params: {},
};

const problems = (change: Record<string, unknown>): string[] => {
  try {
    parseRule({ ...valid, ...change });
  } catch (error) {
    if (error instanceof RuleError) return error.problems;
    throw error;
  }
  return [];
};

describe("parseRule", () => {
  it("accepts a complete rule", () => {
    const rule = parseRule(valid);
    expect(rule.id).toBe("mx-resico-pf");
    expect(rule.validFrom).toEqual(plainDate(2026, 1, 1));
    expect(rule.source.retrievedOn).toEqual(plainDate(2026, 10, 1));
    expect(rule.verification).toEqual({ status: "unverified" });
  });

  it("rejects a rule without a source", () => {
    expect(problems({ source: undefined })).toEqual(["source: required"]);
  });

  it.each([
    ["http://www.sat.gob.mx/", "source.url: must be an https URL"],
    ["not a url", "source.url: must be an https URL"],
    ["", "source.url: must be an https URL"],
  ])("rejects source url %j", (url, message) => {
    expect(problems({ source: { ...valid.source, url } })).toEqual([message]);
  });

  it.each(["mx", "MEX", "M1", ""])("rejects country %j", (country) => {
    expect(problems({ country })).toEqual(["country: must be an ISO 3166-1 alpha-2 code in capitals"]);
  });

  it.each(["", "   "])("rejects blank regime %j", (regime) => {
    expect(problems({ regime })).toEqual(["regime: must not be blank"]);
  });

  it("rejects impossible dates", () => {
    expect(problems({ validFrom: "2026-02-30" })).toEqual(["validFrom: not a valid YYYY-MM-DD date"]);
    expect(problems({ validTo: "2026-1-1" })).toEqual(["validTo: not a valid YYYY-MM-DD date"]);
  });

  it("rejects a reversed validity window", () => {
    expect(problems({ validFrom: "2027-01-01" })).toEqual(["validTo: must not be before validFrom"]);
  });

  it("rejects a source retrieved after the rule stops being valid", () => {
    expect(problems({ source: { ...valid.source, retrievedOn: "2027-01-01" } })).toEqual(["source.retrievedOn: must not be after validTo"]);
  });

  it("requires verifier and date for a verified rule", () => {
    expect(problems({ verification: "verified" })).toEqual(["verifiedBy: required for a verified rule", "verifiedOn: required for a verified rule"]);
    const rule = parseRule({ ...valid, verification: "verified", verifiedBy: "Contadora Pérez", verifiedOn: "2026-10-05" });
    expect(rule.verification).toEqual({ status: "verified", verifiedBy: "Contadora Pérez", verifiedOn: plainDate(2026, 10, 5) });
  });

  it("rejects verifier fields on an unverified rule", () => {
    expect(problems({ verifiedBy: "someone" })).toEqual(["verifiedBy: only allowed on a verified rule"]);
  });

  it("rejects an unknown verification status, kind and params that are not an object", () => {
    expect(problems({ verification: "pending" })).toEqual(['verification: must be "unverified" or "verified"']);
    expect(problems({ kind: "" })).toEqual(["kind: must not be blank"]);
    expect(problems({ params: [] })).toEqual(["params: must be an object"]);
  });

  it("reports every problem together", () => {
    expect(problems({ country: "x", regime: "", validFrom: "nope" })).toHaveLength(3);
  });

  it("rejects input that is not an object", () => {
    expect(() => parseRule(null)).toThrow(RuleError);
    expect(() => parseRule("rule")).toThrow(RuleError);
  });
});

describe("isCurrent", () => {
  const rule = parseRule(valid);
  it("is inclusive on both ends", () => {
    expect(isCurrent(rule, plainDate(2026, 1, 1))).toBe(true);
    expect(isCurrent(rule, plainDate(2026, 12, 31))).toBe(true);
  });
  it("is false outside the window", () => {
    expect(isCurrent(rule, plainDate(2025, 12, 31))).toBe(false);
    expect(isCurrent(rule, plainDate(2027, 1, 1))).toBe(false);
  });
});
