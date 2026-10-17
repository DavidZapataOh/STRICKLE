import { describe, expect, it } from "vitest";
import en from "../src/i18n/dictionaries/en.json";
import es from "../src/i18n/dictionaries/es.json";
import pt from "../src/i18n/dictionaries/pt-br.json";

const leaves = (value: unknown, path = ""): [string, string][] =>
  typeof value === "string" ? [[path, value]] : Object.entries(value as Record<string, unknown>).flatMap(([key, inner]) => leaves(inner, path ? `${path}.${key}` : key));
const mine = (dictionary: typeof en) => ({ currency: dictionary.currency });

describe("the currency strings", () => {
  const base = leaves(mine(en));
  it("exist in all three languages with the same keys and the same placeholders", () => {
    for (const language of [es, pt]) {
      const other = leaves(mine(language));
      expect(other.map(([key]) => key)).toEqual(base.map(([key]) => key));
      for (const [index, [, text]] of other.entries()) {
        const placeholders = (value: string) => [...value.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort();
        expect(placeholders(text), base[index]?.[0]).toEqual(placeholders(base[index]?.[1] ?? ""));
      }
    }
  });
  it("are actually translated", () => {
    for (const language of [es, pt]) {
      for (const [index, [key, text]] of leaves(mine(language)).entries()) {
        if (text === base[index]?.[1] && /[a-z]{5}/i.test(text) && !["currency.eur"].includes(key)) throw new Error(`${key} is not translated: ${text}`);
      }
    }
  });
  it("name all nine reasons the agent can give", () => {
    expect(Object.keys(en.currency.reason).sort()).toEqual(["adapter-not-approved", "better-than-reference", "daily-cap", "failures", "invalid-quote", "quote-unavailable", "stale-feed", "vault-refused", "worse-than-reference"]);
  });
  it("never promise a rate, a saving, a speed or safety", () => {
    for (const [, text] of leaves(mine(en))) expect(text).not.toMatch(/guarantee|insured|no risk|you will save|faster|best rate/i);
  });
  it("read the cap from the vault instead of typing it into the sentence", () => {
    expect(en.currency.explain).toContain("{cap}");
    expect(es.currency.explain).toContain("{cap}");
    expect(pt.currency.explain).toContain("{cap}");
  });
});
