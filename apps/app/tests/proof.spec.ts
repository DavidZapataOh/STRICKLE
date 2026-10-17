import { expect, test } from "@playwright/test";
import { audit } from "@strickle/gates";
import { createElement } from "react";
import { ProofView } from "../src/components/ProofView.tsx";
import en from "../src/i18n/dictionaries/en.json";
import es from "../src/i18n/dictionaries/es.json";
import pt from "../src/i18n/dictionaries/pt-br.json";
import { renderWithAppCss } from "./support/render-audit.ts";

const dictionaries = { en, es, "pt-br": pt } as const;
const a = (n: number) => `0x${n.toString(16).padStart(40, "0")}` as `0x${string}`;
const contracts = [
  { name: "BoxVault", address: a(0xabcdef), deployed: true, verified: true },
  { name: "BoxVaultFactory", address: a(2), deployed: true, verified: false },
  { name: "AgentExecutor", address: a(3), deployed: true, verified: null },
  { name: "PolicyPool", address: a(4), deployed: false, verified: null },
];
const activity = { lastWriteAt: 1_790_000_000 - 90_000, lastTx: `0x${"ab".repeat(32)}` as `0x${string}` };

for (const lang of ["en", "es", "pt-br"] as const) {
  for (const [name, props] of Object.entries({ full: { contracts, activity }, unreadable: { contracts: null, activity: null }, none: { contracts, activity: { lastWriteAt: null, lastTx: null } } })) {
    test(`${lang} proof view (${name}) fits every viewport`, async ({ page, baseURL }) => {
      await renderWithAppCss(page, baseURL as string, createElement(ProofView, { lang, t: dictionaries[lang] as typeof en, now: 1_790_000_000, explorer: "https://explorer.testnet.arc.io", repo: "https://github.com/DavidZapataOh/STRICKLE", ...props }), lang);
      expect(await audit(page)).toEqual([]);
    });
  }
}
