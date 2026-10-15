import fc from "fast-check";
import { type Facts, type FactValue, formatFact } from "@strickle/brain";
import { describe, expect, it } from "vitest";
import { renderExplanation } from "../src/explanation-guard.ts";

const usdc = (units: bigint): FactValue => ({ type: "amount", units, decimals: 6, symbol: "USDC" });
const facts: Facts = {
  kind: "split",
  values: { total: usdc(2_000_000_000n), taxes: usdc(400_000_000n), payroll: usdc(900_000_000n), operating: usdc(200_000_000n), emergency: usdc(300_000_000n), salary: usdc(200_000_000n), profit: usdc(0n), rate: { type: "bps", value: 2_000 } },
  labels: {},
};
const ok = (text: string, lang: "en" | "es" | "pt-br" = "en") => renderExplanation(text, facts, lang, lang === "en" ? "en-US" : lang === "es" ? "es-MX" : "pt-BR");

describe("renderExplanation: accepts placeholders and substitutes the engine's values", () => {
  it("renders a sentence made of words and placeholders", () => {
    expect(ok("Your {total} arrived and I set aside {taxes} for taxes, which is {rate} of it.")).toEqual({
      ok: true,
      text: "Your 2,000.00 USDC arrived and I set aside 400.00 USDC for taxes, which is 20% of it.",
    });
  });
  it("uses the language's number style", () => {
    const r = renderExplanation("Llegaron {total}.", facts, "es", "es-CO");
    expect(r).toEqual({ ok: true, text: "Llegaron 2.000,00 USDC." });
  });
  it("allows the same placeholder twice", () => {
    expect(ok("{taxes} and again {taxes}.")).toMatchObject({ ok: true });
  });
});

describe("renderExplanation: rejects anything the model could invent", () => {
  it.each<[string, string, ("en" | "es" | "pt-br")?]>([
    ["a digit", "I moved 400 to taxes.", "en"],
    ["a digit inside a word", "Plan B2 is ready."],
    ["an unknown placeholder", "I moved {bonus} to taxes."],
    ["an unclosed brace", "I moved {taxes to taxes."],
    ["a stray closing brace", "I moved taxes} to taxes."],
    ["a nested placeholder", "I moved {{taxes}}."],
    ["a spelled-out number in English", "I moved five hundred to taxes."],
    ["a spelled-out number in Spanish", "Moví quinientos a impuestos.", "es"],
    ["a spelled-out number in Portuguese", "Movi cem para impostos.", "pt-br"],
    ["Spanish hundreds in the feminine", "Pagué quinientas veces.", "es"],
    ["Portuguese hundreds", "Movi quinhentos para impostos.", "pt-br"],
    ["a Spanish compound number", "Tengo veintiuno días.", "es"],
    ["an English plural number word", "Hundreds of accounts."],
    ["a fullwidth digit", "I moved \uff15 to taxes."],
    ["a superscript digit", "Plan A\u00b2 is ready."],
    ["a circled digit", "Step \u2460 is ready."],
    ["an Arabic-Indic digit", "I moved \u0663 to taxes."],
    ["a CJK numeral", "I moved \u4e94 to taxes."],
    ["an emoji or symbol", "Safe \ud83d\udc4d."],
    ["an empty text", "   "],
    ["a text over 600 characters", "word ".repeat(130)],
  ])("%s", (...row) => {
    const [, text, lang = "en"] = row;
    expect(ok(text, lang)).toMatchObject({ ok: false });
  });
  it("is not fooled by accents or capitals in number words", () => {
    expect(ok("Tres cuentas.", "es")).toMatchObject({ ok: false });
    expect(ok("TRÊS contas.", "pt-br")).toMatchObject({ ok: false });
    expect(ok("FIVE accounts.")).toMatchObject({ ok: false });
  });
  it("does not reject ordinary words that are not numbers", () => {
    expect(ok("A good week: {profit} went to profit and nothing is at risk.")).toMatchObject({ ok: true });
  });
});

describe("renderExplanation: property", () => {
  const words = fc.constantFrom("good", "week", "safe", "set", "aside", "for", "taxes", "payroll", "moved", "your", "and", "now", "kept", "total", "clean");
  it("any text of plain words and known placeholders passes, never vacuously, and contains exactly the engine's values", () => {
    fc.assert(fc.property(fc.array(fc.tuple(words, fc.constantFrom("total", "taxes", "payroll", "operating", "emergency", "salary", "profit", "rate")), { minLength: 1, maxLength: 5 }), (parts) => {
      const text = parts.map(([w, key]) => `${w} {${key}}`).join(" ").trim();
      const r = ok(text);
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      for (const [, key] of parts) expect(r.text).toContain(formatFact(facts.values[key] as FactValue, "en", "en-US"));
      expect(r.text).not.toMatch(/[{}]/);
    }), { numRuns: 200 });
  });
  it("inserting any digit sequence into a valid text makes it fail", () => {
    fc.assert(fc.property(fc.stringMatching(/^[0-9]{1,6}$/), (digits) => {
      expect(ok(`I moved {taxes} and ${digits} more.`)).toMatchObject({ ok: false });
    }), { numRuns: 200 });
  });
});
