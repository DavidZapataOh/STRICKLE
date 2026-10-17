import { describe, expect, it } from "vitest";
import en from "../src/i18n/dictionaries/en.json";
import es from "../src/i18n/dictionaries/es.json";
import pt from "../src/i18n/dictionaries/pt-br.json";

const leaves = (value: unknown, path = ""): [string, string][] =>
  typeof value === "string" ? [[path, value]] : Object.entries(value as Record<string, unknown>).flatMap(([key, inner]) => leaves(inner, path ? `${path}.${key}` : key));
const mine = (dictionary: typeof en) => ({ home: dictionary.home, boxesPage: dictionary.boxesPage });

describe("the Home and Boxes strings", () => {
  const base = leaves(mine(en));
  const same = (language: typeof en) => leaves(mine(language));

  it("exist in all three languages with the same keys and the same placeholders", () => {
    for (const language of [es, pt]) {
      expect(same(language).map(([key]) => key)).toEqual(base.map(([key]) => key));
      for (const [index, [, text]] of same(language).entries()) {
        const placeholders = (value: string) => [...value.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort();
        expect(placeholders(text), base[index]?.[0]).toEqual(placeholders(base[index]?.[1] ?? ""));
      }
    }
  });

  it("are actually translated, apart from words that are the same in every language", () => {
    const allowed = new Set(["home.events.title"]);
    for (const language of [es, pt]) {
      for (const [index, [key, text]] of same(language).entries()) {
        if (!allowed.has(key) && text === base[index]?.[1] && /[a-z]{4}/i.test(text)) throw new Error(`${key} is not translated: ${text}`);
      }
    }
  });

  it("keep the digit out of the share line, so the number can only come from the plan", () => {
    for (const language of [en, es, pt]) expect(language.home.strip.above).not.toMatch(/\d/);
  });

  it("never call a salary insured or guaranteed", () => {
    for (const [, text] of [...same(es), ...same(pt)]) expect(text).not.toMatch(/asegura|garantid/i);
  });
});

describe("the slice sent to the data screens", () => {
  it("holds what Home and Boxes read and nothing of the onboarding", async () => {
    const { dataText } = await import("../src/i18n/slices.ts");
    const slice = dataText(en);
    expect(Object.keys(slice).sort()).toEqual(["boxes", "boxesPage", "currency", "home", "screens"]);
    expect(JSON.stringify(slice).length).toBeLessThan(JSON.stringify(en).length / 2);
  });
});
