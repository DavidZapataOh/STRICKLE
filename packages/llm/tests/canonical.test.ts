import { type FactValue, type Facts, type Lang, type NumberStyle, type ReceiptKind, TEMPLATE_KEYS, placeholderTemplate, template } from "@strickle/brain";
import { describe, expect, it } from "vitest";
import { missingFacts, renderExplanation } from "../src/explanation-guard.ts";

const usdc = (units: bigint): FactValue => ({ type: "amount", units, decimals: 6, symbol: "USDC" });

const factsFor = (kind: ReceiptKind): Facts => {
  const keys = TEMPLATE_KEYS[kind];
  const values: Record<string, FactValue> = {};
  keys.values.forEach((key, i) => {
    const bps = key === "rate" || key === "apr" || (kind === "taxes-recompute" && (key === "from" || key === "to"));
    values[key] = bps ? { type: "bps", value: 2_000 + i } : usdc(BigInt(1_000_000 * (i + 1)) + 500_000n);
  });
  const labels: Record<string, string> = {};
  for (const key of keys.labels) labels[key] = key === "reason" ? "scenario-risk" : `label-${key}`;
  return { kind, values, labels };
};

const KINDS = Object.keys(TEMPLATE_KEYS) as ReceiptKind[];
const LANGS: [Lang, NumberStyle][] = [["en", "en-US"], ["es", "es-CO"], ["pt-br", "pt-BR"]];

describe("the canonical sentence is always an acceptable model answer", () => {
  it.each(KINDS)("%s: rendering the placeholder sentence gives exactly the deterministic template, in every language", (kind) => {
    const facts = factsFor(kind);
    for (const [lang, style] of LANGS) {
      const canonical = placeholderTemplate(facts, lang);
      expect(renderExplanation(canonical, facts, lang, style)).toEqual({ ok: true, text: template(facts, lang, style) });
      expect(missingFacts(canonical, facts)).toEqual([]);
    }
  });
});

describe("missingFacts", () => {
  it("lists the facts a text leaves out, in the order of the facts", () => {
    const facts = factsFor("split");
    expect(missingFacts("I set aside {taxes} for taxes.", facts)).toEqual(["total", "payroll", "operating", "emergency", "salary", "profit", "rate"]);
  });
  it("is empty when every placeholder is used, in any order and any number of times", () => {
    const facts = factsFor("salary-trim");
    expect(missingFacts("{pending} then {paid} and {owed} and {paid} again", facts)).toEqual([]);
  });
  it("ignores placeholders that are not facts (the guard rejects those separately)", () => {
    expect(missingFacts("{paid} {owed} {pending} {bonus}", factsFor("salary-trim"))).toEqual([]);
  });
});
