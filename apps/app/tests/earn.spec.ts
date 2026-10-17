import { expect, test } from "@playwright/test";
import { audit } from "@strickle/gates";
import { createElement } from "react";
import { EarnControl, type EarnRow } from "../src/components/EarnControl.tsx";
import en from "../src/i18n/dictionaries/en.json";
import es from "../src/i18n/dictionaries/es.json";
import pt from "../src/i18n/dictionaries/pt-br.json";
import { settingsText } from "../src/i18n/slices.ts";
import type { EarnStatus } from "../src/yield/status.ts";
import { renderWithAppCss } from "./support/render-audit.ts";

const dictionaries = { en, es, "pt-br": pt } as const;
const quote = { address: "0xAabbeF1D3971c710276ed41eC791BbE14CdB8E88" as const, name: "EarnKit USDC Vault", protocol: "Morpho", apyBps: 420, asOf: "2026-10-17T20:10:04Z" };
const rows: EarnRow[] = [
  { box: "profit", position: 3_003_174n, available: 4_000_000_000n, room: 4_000_000_000n, maxInvestBps: 10_000 },
  { box: "taxes", position: 0n, available: 2_000_000_000n, room: 1_000_000_000n, maxInvestBps: 5_000 },
  { box: "emergency", position: 99_999_999_999_999n, available: 99_999_999_999_999n, room: 99_999_999_999_999n, maxInvestBps: 10_000 },
  { box: "operating", position: 0n, available: 5_000_000_000n, room: 0n, maxInvestBps: 0 },
];
const statuses: Record<string, EarnStatus> = {
  active: { kind: "active" },
  pending: { kind: "pending", from: 1_800_000_000 },
  unavailable: { kind: "unavailable" },
  unreadable: { kind: "unreadable" },
  notAllowed: { kind: "not-allowed", needs: ["adapter", "vault"] },
};

for (const lang of ["en", "es", "pt-br"] as const) {
  const t = settingsText(dictionaries[lang] as typeof en);
  for (const [name, status] of Object.entries(statuses)) {
    for (const withQuote of [true, false]) {
      test(`${lang} earn control (${name}${withQuote ? "" : ", no rate"}) fits every viewport`, async ({ page, baseURL }) => {
        const props = { lang, t, status, rows, quote: withQuote ? quote : undefined, message: "x".repeat(10), onMove: async () => undefined };
        await renderWithAppCss(page, baseURL as string, createElement(EarnControl, props), lang);
        expect(await audit(page)).toEqual([]);
      });
    }
  }
}
