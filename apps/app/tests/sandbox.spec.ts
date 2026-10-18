import { expect, test } from "@playwright/test";
import { audit } from "@strickle/gates";
import { createElement } from "react";
import { SandboxControls } from "../src/components/SandboxControls.tsx";
import en from "../src/i18n/dictionaries/en.json";
import es from "../src/i18n/dictionaries/es.json";
import pt from "../src/i18n/dictionaries/pt-br.json";
import { renderWithAppCss } from "./support/render-audit.ts";

const dictionaries = { en, es, "pt-br": pt } as const;

for (const lang of ["en", "es", "pt-br"] as const) {
  for (const [name, props] of Object.entries({ ready: { date: "2026-11-03", busy: false, failed: false }, failed: { date: "2026-11-03", busy: true, failed: true }, unknown: { date: null, busy: false, failed: false } })) {
    test(`${lang} sandbox controls (${name}) fit every viewport`, async ({ page, baseURL }) => {
      await renderWithAppCss(page, baseURL as string, createElement(SandboxControls, { t: dictionaries[lang] as typeof en, onAdvance: () => {}, ...props }), lang);
      expect(await audit(page)).toEqual([]);
    });
  }
}
