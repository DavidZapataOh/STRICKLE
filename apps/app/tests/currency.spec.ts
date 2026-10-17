import { expect, test } from "@playwright/test";
import { audit } from "@strickle/gates";
import { createElement } from "react";
import type { ConversionStatus } from "../src/boxes/currency.ts";
import { ALL_DOLLARS, CurrencyControl } from "../src/components/CurrencyControl.tsx";
import en from "../src/i18n/dictionaries/en.json";
import es from "../src/i18n/dictionaries/es.json";
import pt from "../src/i18n/dictionaries/pt-br.json";
import { settingsText } from "../src/i18n/slices.ts";
import { renderWithAppCss } from "./support/render-audit.ts";

const dictionaries = { en, es, "pt-br": pt } as const;
const statuses: Record<string, ConversionStatus> = {
  active: { kind: "active", cap: 5_000_000_000n },
  pending: { kind: "pending", from: 1_800_000_000 },
  unavailable: { kind: "unavailable" },
  notAllowed: { kind: "not-allowed" },
  paused: { kind: "paused", reason: "better-than-reference", cap: 99_999_999_999_999n },
};

for (const lang of ["en", "es", "pt-br"] as const) {
  const t = settingsText(dictionaries[lang] as typeof en);
  for (const [name, status] of Object.entries(statuses)) {
    test(`${lang} currency control (${name}) fits every viewport`, async ({ page, baseURL }) => {
      const currencies = { ...ALL_DOLLARS, payroll: "EUR" as const, profit: "EUR" as const };
      await renderWithAppCss(page, baseURL as string, createElement(CurrencyControl, { lang, t, currencies, status, message: "x".repeat(10) }), lang);
      expect(await audit(page)).toEqual([]);
    });
  }
}

test("the settings screen still loads without a policy violation", async ({ page }) => {
  const violations: string[] = [];
  page.on("console", (message) => /Content Security Policy|Refused to/i.test(message.text()) && violations.push(message.text()));
  await page.goto("/en/settings", { waitUntil: "networkidle" });
  expect(violations).toEqual([]);
});
