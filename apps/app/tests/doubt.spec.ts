import { expect, test } from "@playwright/test";
import { audit } from "@strickle/gates";
import { createElement, Fragment } from "react";
import { DoubtCard } from "../src/components/DoubtCard.tsx";
import { ReclassifiedStrip } from "../src/components/ReclassifiedStrip.tsx";
import en from "../src/i18n/dictionaries/en.json";
import es from "../src/i18n/dictionaries/es.json";
import pt from "../src/i18n/dictionaries/pt-br.json";
import { activityText } from "../src/i18n/slices.ts";
import { renderWithAppCss } from "./support/render-audit.ts";

const dictionaries = { en, es, "pt-br": pt } as const;
const sender = "0x00000000000000000000000000000000000000a1" as const;
const doubts = {
  one: { arrivalId: "0123456789", asset: "USDC" as const, amount: 2_500_000_000n, flags: ["outlier-size" as const], sender, answered: false },
  all: { arrivalId: "0123456789", asset: "USDC" as const, amount: 99_999_999_999_999n, flags: ["outlier-size" as const, "own-address" as const, "amount-matches-outflow" as const, "unattributed" as const], sender: null, answered: false },
};

for (const lang of ["en", "es", "pt-br"] as const) {
  const t = activityText(dictionaries[lang] as typeof en);
  for (const [name, doubt] of Object.entries(doubts)) {
    for (const phase of ["idle", "signing", "failed"] as const) {
      test(`${lang} doubt card ${name} (${phase}) fits every viewport`, async ({ page, baseURL }) => {
        const strip = createElement(ReclassifiedStrip, { correction: { arrivalId: doubt.arrivalId, amount: doubt.amount, from: "income", to: "own-transfer" }, locale: lang, t, phase, onUndo: () => {} });
        const card = createElement(DoubtCard, { doubt, locale: lang, t, phase, onIncome: () => {}, onMine: () => {} });
        await renderWithAppCss(page, baseURL as string, createElement(Fragment, null, card, strip), lang);
        expect(await audit(page)).toEqual([]);
      });
    }
  }
}

test("the activity screen still loads without a single policy violation", async ({ page }) => {
  const violations: string[] = [];
  page.on("console", (message) => /Content Security Policy|Refused to/i.test(message.text()) && violations.push(message.text()));
  await page.goto("/en/activity", { waitUntil: "networkidle" });
  expect(violations).toEqual([]);
});
