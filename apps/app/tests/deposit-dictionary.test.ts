import { describe, expect, it } from "vitest";
import en from "../src/i18n/dictionaries/en.json";
import es from "../src/i18n/dictionaries/es.json";
import pt from "../src/i18n/dictionaries/pt-br.json";

const leaves = (value: unknown, path = ""): [string, string][] =>
  typeof value === "string" ? [[path, value]] : Object.entries(value as Record<string, unknown>).flatMap(([key, inner]) => leaves(inner, path ? `${path}.${key}` : key));
const mine = (dictionary: typeof en) => ({ deposit: dictionary.deposit });

describe("the deposit strings", () => {
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

  it("are actually translated, apart from the chains' own names", () => {
    for (const language of [es, pt]) {
      for (const [index, [key, text]] of same(language).entries()) {
        if (key.startsWith("deposit.chains.") || key === "deposit.token.usdc" || key === "deposit.token.usdt") continue;
        if (text === base[index]?.[1] && /[a-z]{4}/i.test(text)) throw new Error(`${key} is not translated: ${text}`);
      }
    }
  });

  it("name every error the flow can raise", () => {
    expect(Object.keys(en.deposit.errors).sort()).toEqual(["cost-too-high", "insufficient-funds", "no-wallet", "quote-expired", "quote-refused", "rejected", "stale", "timeout", "unavailable", "wrong-chain"]);
  });
});
