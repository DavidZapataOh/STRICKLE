import { expect, test } from "@playwright/test";
import { audit } from "@strickle/gates";
import { createElement } from "react";
import { JudgesView } from "../src/components/JudgesView.tsx";
import en from "../src/i18n/dictionaries/en.json";
import es from "../src/i18n/dictionaries/es.json";
import pt from "../src/i18n/dictionaries/pt-br.json";
import { renderWithAppCss } from "./support/render-audit.ts";

const dictionaries = { en, es, "pt-br": pt } as const;
const maria = { open: { status: "open", vault: "0x14b5e469720A4cb071772258D9ac8f0B37Ab8D9A" }, unavailable: { status: "unavailable" } } as const;

for (const lang of ["en", "es", "pt-br"] as const) {
  for (const [name, door] of Object.entries(maria)) {
    test(`${lang} judges page (${name}) fits every viewport`, async ({ page, baseURL }) => {
      await renderWithAppCss(page, baseURL as string, createElement(JudgesView, { lang, t: dictionaries[lang] as typeof en, maria: door }), lang);
      expect(await audit(page)).toEqual([]);
    });
  }
}
