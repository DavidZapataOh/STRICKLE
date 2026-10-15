import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { plainDate } from "@strickle/core";
import { describe, expect, it } from "vitest";
import { checkEligibility, loadRules } from "../src/index.ts";

const condition = {
  id: "paid-through-bank",
  description: "The payment must reach a bank account of the provider.",
  basis: "Law art. 1: the payment must be made to a bank account.",
  satisfiedBy: ["bank"],
  violatedBy: ["stablecoin"],
};

const params = {
  regime: "test-benefit",
  benefit: "A test benefit",
  safePath: "bank-and-mirror-mode",
  note: "Test note.",
  conditions: [condition],
};

const envelope = {
  id: "xx-test",
  country: "MX",
  regime: "Test regime",
  kind: "eligibility-conditions",
  version: "1",
  validFrom: "2026-01-01",
  validTo: "2026-12-31",
  source: { title: "Test law", url: "https://example.org/law", retrievedOn: "2026-10-15" },
  verification: "unverified",
  params,
};

function loadOne(rule: unknown) {
  const root = mkdtempSync(join(tmpdir(), "eligibility-"));
  mkdirSync(join(root, "MX"));
  writeFileSync(join(root, "MX", "x.json"), JSON.stringify(rule));
  return () => loadRules(root);
}

const withParams = (changes: Record<string, unknown>) => ({ ...envelope, params: { ...params, ...changes } });
const withCondition = (changes: Record<string, unknown>) => withParams({ conditions: [{ ...condition, ...changes }] });

describe("eligibility-conditions params", () => {
  it("loads a valid rule", () => {
    expect(loadOne(envelope)()).toHaveLength(1);
  });

  it.each([
    ["a blank benefit", withParams({ benefit: " " }), /benefit/],
    ["a blank regime id", withParams({ regime: "" }), /regime/],
    ["a blank note", withParams({ note: "" }), /note/],
    ["another safe path", withParams({ safePath: "stablecoin-anyway" }), /safePath/],
    ["no conditions", withParams({ conditions: [] }), /conditions/],
    ["duplicate condition ids", withParams({ conditions: [condition, condition] }), /duplicate/],
    ["a blank description", withCondition({ description: "" }), /description/],
    ["a blank basis", withCondition({ basis: "" }), /basis/],
    ["an unknown method", withCondition({ violatedBy: ["cash"] }), /method/],
    ["lists that overlap", withCondition({ violatedBy: ["bank", "stablecoin"] }), /disjoint/],
    ["lists that leave a method out", withCondition({ violatedBy: [] }), /cover/],
  ])("rejects %s", (_, rule, message) => {
    expect(loadOne(rule)).toThrow(message);
  });
});

describe("checkEligibility", () => {
  const rules = loadOne(envelope)();
  const input = { country: "MX", regime: "test-benefit", collectionMethod: "stablecoin" } as const;

  it("is ok when collecting by bank", () => {
    expect(checkEligibility(rules, { ...input, collectionMethod: "bank" })).toEqual({ status: "ok" });
  });

  it("warns for stablecoin with the benefit, the broken conditions, the source and the safe path", () => {
    const result = checkEligibility(rules, input);
    expect(result).toEqual({
      status: "warn",
      benefit: "A test benefit",
      conditions: [{ id: condition.id, description: condition.description, basis: condition.basis }],
      safePath: "bank-and-mirror-mode",
      source: { ...envelope.source, retrievedOn: plainDate(2026, 10, 15) },
      verification: { status: "unverified" },
      note: "Test note.",
    });
  });

  it("lists only the conditions the method breaks", () => {
    const other = { ...condition, id: "other", satisfiedBy: ["bank", "stablecoin"], violatedBy: [] };
    const loaded = loadOne(withParams({ conditions: [other, condition] }))();
    const result = checkEligibility(loaded, input);
    expect(result.status === "warn" && result.conditions.map((c) => c.id)).toEqual([condition.id]);
  });

  it("accepts a single rule", () => {
    expect(checkEligibility(rules[0]!, input).status).toBe("warn");
  });

  it("reports no-rules for an unknown country, an unknown regime and a rule of another kind", () => {
    expect(checkEligibility(rules, { ...input, country: "ZZ" })).toEqual({ status: "no-rules" });
    expect(checkEligibility(rules, { ...input, regime: "nope" })).toEqual({ status: "no-rules" });
    expect(checkEligibility([{ ...rules[0]!, kind: "resico-monthly" }], input)).toEqual({ status: "no-rules" });
    expect(checkEligibility([], input)).toEqual({ status: "no-rules" });
  });

  it("throws on an unknown collection method instead of answering ok", () => {
    expect(() => checkEligibility(rules, { ...input, collectionMethod: "cash" as never })).toThrow(RangeError);
  });
});

describe("shipped eligibility rules", () => {
  const rules = loadRules(new URL("../rules", import.meta.url).pathname);
  const cases = [
    ["MX", "export-services-vat-zero", "ordenjuridico.gob.mx", "0% VAT"],
    ["BR", "export-services-pis-cofins-exemption", "antt", "PIS/COFINS"],
    ["PK", "export-services-final-tax", "fbr.gov.pk", "0.25%"],
  ] as const;

  it.each(cases)("%s %s warns for stablecoin with its source and is ok through a bank", (country, regime, host, benefit) => {
    const warn = checkEligibility(rules, { country, regime, collectionMethod: "stablecoin" });
    if (warn.status !== "warn") throw new Error(`expected a warning, got ${warn.status}`);
    expect(warn.source.url).toContain(host);
    expect(warn.source.retrievedOn).toEqual(plainDate(2026, 10, 15));
    expect(warn.benefit).toContain(benefit);
    expect(warn.verification.status).toBe("unverified");
    expect(warn.safePath).toBe("bank-and-mirror-mode");
    expect(warn.conditions.length).toBeGreaterThan(0);
    expect(checkEligibility(rules, { country, regime, collectionMethod: "bank" })).toEqual({ status: "ok" });
  });

  it("quotes the Mexican payment route and the Brazilian foreign-currency inflow", () => {
    const mx = checkEligibility(rules, { country: "MX", regime: "export-services-vat-zero", collectionMethod: "stablecoin" });
    const br = checkEligibility(rules, { country: "BR", regime: "export-services-pis-cofins-exemption", collectionMethod: "stablecoin" });
    expect(JSON.stringify(mx)).toContain("cheque nominativo o transferencia de fondos");
    expect(JSON.stringify(br)).toContain("ingresso de divisas");
  });

  it("returns no-rules for a country without eligibility rules", () => {
    expect(checkEligibility(rules, { country: "AR", regime: "export-services-vat-zero", collectionMethod: "stablecoin" })).toEqual({ status: "no-rules" });
  });
});
