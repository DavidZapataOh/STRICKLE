import { plainDate } from "@strickle/core";
import { describe, expect, it } from "vitest";
import { type FactValue, type Facts, type Lang, type NumberStyle, type ReceiptKind, TEMPLATE_KEYS, formatFact, template } from "../src/templates.ts";

const usdc = (units: bigint): FactValue => ({ type: "amount", units, decimals: 6, symbol: "USDC" });

describe("formatFact: amounts", () => {
  it.each([
    [0n, "en-US", "0.00 USDC"],
    [1n, "en-US", "0.00 USDC"],
    [5_000n, "en-US", "0.00 USDC"], // 0.005 is a tie: half to even gives 0.00
    [999_999n, "en-US", "1.00 USDC"],
    [1_234_500_000n, "en-US", "1,234.50 USDC"],
    [1_234_500_000n, "es-MX", "1,234.50 USDC"],
    [1_234_500_000n, "es-CO", "1.234,50 USDC"],
    [1_234_500_000n, "es-AR", "1.234,50 USDC"],
    [1_234_500_000n, "pt-BR", "1.234,50 USDC"],
    [1_000_000_000_000n, "en-US", "1,000,000.00 USDC"],
    [9_223_372_036_854_775_808n, "en-US", "9,223,372,036,854.78 USDC"],
  ] as const)("%s units as %s is %s", (units, style, expected) => {
    expect(formatFact(usdc(units), "en", style)).toBe(expected);
  });
  it("rounds half to even at two decimals", () => {
    expect(formatFact(usdc(5_000n), "en", "en-US")).toBe("0.00 USDC"); // 0.005 -> 0.00
    expect(formatFact(usdc(15_000n), "en", "en-US")).toBe("0.02 USDC"); // 0.015 -> 0.02
    expect(formatFact(usdc(25_000n), "en", "en-US")).toBe("0.02 USDC"); // 0.025 -> 0.02
  });
  it("rejects negative amounts", () => {
    expect(() => formatFact(usdc(-1n), "en", "en-US")).toThrow(RangeError);
  });
});

describe("formatFact: the other types", () => {
  it("basis points as a percentage with up to two decimals, trailing zeros trimmed", () => {
    expect(formatFact({ type: "bps", value: 200 }, "en", "en-US")).toBe("2%");
    expect(formatFact({ type: "bps", value: 250 }, "en", "en-US")).toBe("2.5%");
    expect(formatFact({ type: "bps", value: 250 }, "es", "es-CO")).toBe("2,5%");
    expect(formatFact({ type: "bps", value: 1 }, "pt-br", "pt-BR")).toBe("0,01%");
  });
  it("days, counts and dates", () => {
    expect(formatFact({ type: "days", value: 14 }, "en", "en-US")).toBe("14 days");
    expect(formatFact({ type: "days", value: 1 }, "en", "en-US")).toBe("1 day");
    expect(formatFact({ type: "days", value: 1 }, "es", "es-MX")).toBe("1 día");
    expect(formatFact({ type: "days", value: 1 }, "pt-br", "pt-BR")).toBe("1 dia");
    expect(formatFact({ type: "days", value: 0 }, "en", "en-US")).toBe("0 days");
    expect(formatFact({ type: "days", value: 14 }, "pt-br", "pt-BR")).toBe("14 dias");
    expect(formatFact({ type: "count", value: 200 }, "en", "en-US")).toBe("200");
    expect(formatFact({ type: "date", value: plainDate(2026, 1, 15) }, "en", "en-US")).toBe("Jan 15, 2026");
    expect(formatFact({ type: "date", value: plainDate(2026, 1, 15) }, "es", "es-MX")).toBe("15 ene 2026");
    expect(formatFact({ type: "date", value: plainDate(2026, 9, 5) }, "pt-br", "pt-BR")).toBe("5 set 2026");
  });
  it("rejects a non-integer or negative day, count or basis-point value", () => {
    expect(() => formatFact({ type: "days", value: -1 }, "en", "en-US")).toThrow(RangeError);
    expect(() => formatFact({ type: "count", value: 1.5 }, "en", "en-US")).toThrow(RangeError);
    expect(() => formatFact({ type: "bps", value: -5 }, "en", "en-US")).toThrow(RangeError);
  });
});

const sample = (kind: ReceiptKind): Facts => {
  const keys = TEMPLATE_KEYS[kind];
  const values: Record<string, FactValue> = {};
  keys.values.forEach((key, i) => {
    const bps = key === "rate" || (kind === "taxes-recompute" && (key === "from" || key === "to"));
    values[key] = bps ? { type: "bps", value: 2_000 + i } : usdc(BigInt(1_000_000 * (i + 1)) + 500_000n);
  });
  const labels: Record<string, string> = {};
  for (const key of keys.labels) labels[key] = key === "reason" ? "scenario-risk" : `label-${key}`;
  return { kind, values, labels };
};

describe("template", () => {
  const kinds = Object.keys(TEMPLATE_KEYS) as ReceiptKind[];
  const langs: [Lang, NumberStyle][] = [["en", "en-US"], ["es", "es-MX"], ["pt-br", "pt-BR"]];

  it.each(kinds)("%s renders in the three languages with every fact and nothing unreplaced", (kind) => {
    const facts = sample(kind);
    for (const [lang, style] of langs) {
      const text = template(facts, lang, style);
      expect(text).not.toMatch(/[{}]/);
      for (const value of Object.values(facts.values)) expect(text).toContain(formatFact(value, lang, style));
      for (const label of Object.values(facts.labels).filter((l) => l !== "scenario-risk")) expect(text).toContain(label);
    }
  });

  it("a breaker halt shows a plain-language reason in each language", () => {
    const facts: Facts = { kind: "breaker-halt", values: {}, labels: { reason: "daily-cap" } };
    expect(template(facts, "en", "en-US")).toContain("daily cap");
    expect(template(facts, "es", "es-MX")).toContain("tope diario");
    expect(template(facts, "pt-br", "pt-BR")).toContain("teto diário");
  });

  it("every kind has its keys declared and the three languages differ", () => {
    for (const kind of kinds) {
      const facts = sample(kind);
      const texts = new Set(langs.map(([lang, style]) => template(facts, lang, style)));
      expect(texts.size).toBe(3);
    }
  });

  it("throws on a missing fact, a missing label and an unknown kind", () => {
    const facts = sample("payment");
    expect(() => template({ ...facts, values: {} }, "en", "en-US")).toThrow(/amount/);
    expect(() => template({ ...facts, labels: {} }, "en", "en-US")).toThrow(/to/);
    expect(() => template({ kind: "nope" as ReceiptKind, values: {}, labels: {} }, "en", "en-US")).toThrow(/unknown/);
  });

  it("maps the salary-trim reason code to a phrase in each language", () => {
    const facts = sample("salary-trim");
    expect(template(facts, "en", "en-US")).toContain("scenarios");
    expect(template(facts, "es", "es-MX")).toContain("escenarios");
    expect(template(facts, "pt-br", "pt-BR")).toContain("cenários");
  });
});
