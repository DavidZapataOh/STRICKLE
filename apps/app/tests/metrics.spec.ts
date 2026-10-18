import { expect, test } from "@playwright/test";
import { audit } from "@strickle/gates";
import { createElement } from "react";
import { MetricsView } from "../src/components/MetricsView.tsx";
import en from "../src/i18n/dictionaries/en.json";
import es from "../src/i18n/dictionaries/es.json";
import pt from "../src/i18n/dictionaries/pt-br.json";
import type { Metrics } from "../src/server/metrics.ts";
import { renderWithAppCss } from "./support/render-audit.ts";

const dictionaries = { en, es, "pt-br": pt } as const;
const amounts = (total: bigint, team: bigint) => ({ total: total.toString(), team: team.toString(), organic: (total - team).toString() });
const huge = 99_999_999_999_999_999n;
const payload: Metrics = {
  network: "testnet",
  asOfBlock: "67720256",
  vaults: { total: 99_999, team: 2, organic: 99_997 },
  usdcHeld: amounts(huge, 1_000n),
  usdcAllocated: amounts(huge, 1_000n),
  agentMoved: { total: amounts(huge, 5n), byKind: { split: amounts(huge, 1n), salary: amounts(1n, 1n), swap: amounts(0n, 0n), earn: amounts(huge, 7n) } },
  notMeasured: ["taxesCoveredOnTime", "cushionDays", "yield", "earlyPayments", "invariantBreaches"],
};

for (const lang of ["en", "es", "pt-br"] as const) {
  test(`${lang} metrics view fits every viewport`, async ({ page, baseURL }) => {
    await renderWithAppCss(page, baseURL as string, createElement(MetricsView, { lang, t: dictionaries[lang] as typeof en, payload }), lang);
    expect(await audit(page)).toEqual([]);
  });
}
