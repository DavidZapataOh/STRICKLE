import { expect, test } from "@playwright/test";
import { audit } from "@strickle/gates";
import { createElement } from "react";
import { ProofAttestation } from "../src/components/ProofAttestation.tsx";
import en from "../src/i18n/dictionaries/en.json";
import es from "../src/i18n/dictionaries/es.json";
import pt from "../src/i18n/dictionaries/pt-br.json";
import type { AttestationReport } from "../src/server/attestation-report.ts";
import { renderWithAppCss } from "./support/render-audit.ts";

const dictionaries = { en, es, "pt-br": pt } as const;
const id = `0x${"ab".repeat(32)}` as const;
const contracts = ["AgentExecutor", "AgentState", "AgentHeartbeat"].map((name) => ({ name, workflowId: id }));
const reproduce = `cre workflow hash ./workflows/agent --public_key 0x${"12".repeat(20)}`;
const ok: AttestationReport = { contracts, status: "consistent", reproduce, report: { tx: `0x${"cd".repeat(32)}`, at: 1_790_000_000 - 600, workflowId: id, valid: 3, threshold: 2, ok: true, matches: true } };
const cases: Record<string, AttestationReport | null> = {
  ok,
  mismatch: { ...ok, status: "mismatch", report: { ...ok.report, ok: false, matches: false } as AttestationReport["report"] },
  none: { ...ok, report: { error: "none" } },
  unreadable: null,
};

for (const lang of ["en", "es", "pt-br"] as const) {
  for (const [name, report] of Object.entries(cases)) {
    test(`${lang} attestation panel (${name}) fits every viewport`, async ({ page, baseURL }) => {
      await renderWithAppCss(page, baseURL as string, createElement(ProofAttestation, { lang, t: dictionaries[lang] as typeof en, report, now: 1_790_000_000, explorer: "https://explorer.testnet.arc.io" }), lang);
      expect(await audit(page)).toEqual([]);
    });
  }
}
