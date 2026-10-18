import { expect, test } from "@playwright/test";
import { audit } from "@strickle/gates";
import { createElement } from "react";
import { DocsIndex, DocsTopic } from "../src/components/DocsView.tsx";
import { search } from "../src/docs/search.ts";
import { topicsFor } from "../src/docs/topics.ts";
import en from "../src/i18n/dictionaries/en.json";
import es from "../src/i18n/dictionaries/es.json";
import pt from "../src/i18n/dictionaries/pt-br.json";
import { renderWithAppCss } from "./support/render-audit.ts";

const dictionaries = { en, es, "pt-br": pt } as const;

for (const lang of ["en", "es", "pt-br"] as const) {
  const t = dictionaries[lang] as typeof en;
  const topics = topicsFor(lang);
  const longest = [...topics].sort((a, b) => JSON.stringify(b).length - JSON.stringify(a).length)[0] as (typeof topics)[number];
  const pages: Record<string, () => ReturnType<typeof createElement>> = {
    index: () => createElement(DocsIndex, { lang, t, topics, query: null, hits: null }),
    results: () => createElement(DocsIndex, { lang, t, topics, query: "a", hits: search(lang, "a") }),
    nothing: () => createElement(DocsIndex, { lang, t, topics, query: "q".repeat(80), hits: [] }),
    topic: () => createElement(DocsTopic, { lang, t, topic: longest }),
  };
  for (const [name, page] of Object.entries(pages)) {
    test(`${lang} docs ${name} fits every viewport`, async ({ page: browser, baseURL }) => {
      await renderWithAppCss(browser, baseURL as string, page(), lang);
      expect(await audit(browser)).toEqual([]);
    });
  }
}
