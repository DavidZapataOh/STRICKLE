import { expect, test } from "@playwright/test";
import { audit } from "@strickle/gates";
import { createElement } from "react";
import { CardView } from "../src/components/CardPay.tsx";
import { PayView } from "../src/components/PayView.tsx";
import en from "../src/i18n/dictionaries/en.json";
import es from "../src/i18n/dictionaries/es.json";
import pt from "../src/i18n/dictionaries/pt-br.json";
import { payText } from "../src/i18n/slices.ts";
import type { CardState } from "../src/payments/card-events.ts";
import type { PublicInvoice } from "../src/server/pay.ts";
import { renderWithAppCss } from "./support/render-audit.ts";

const dictionaries = { en, es, "pt-br": pt } as const;
const invoice: PublicInvoice = { label: "Website redesign", payeeName: "Ana Studio", note: "October", amount: "100000000", paid: "0", remaining: "100000000", status: "open", expiresAt: null, expired: false, closed: false, vault: "0x8AB41267Adc223EF245c46537870Ae8744b9b3F8", memoId: `0x${"ab".repeat(32)}`, chainId: 5042002, usdc: "0x3600000000000000000000000000000000000000", cardAvailable: true };
const states: Record<string, CardState> = {
  idle: { step: "idle" },
  minting: { step: "minting" },
  widget: { step: "widget", sessionId: "s" },
  waiting: { step: "waiting", sessionId: "s" },
  settled: { step: "settled" },
  blocked: { step: "failed", reason: "blocked" },
  expired: { step: "failed", reason: "expired" },
};

for (const lang of ["en", "es", "pt-br"] as const) {
  const t = payText(dictionaries[lang] as typeof en);
  test(`${lang} payer page with the card option fits every viewport`, async ({ page, baseURL }) => {
    await renderWithAppCss(page, baseURL as string, createElement(PayView, { lang, t, invoice, phase: "idle", otherOpen: false, actions: { arc: () => {}, other: () => {}, copy: () => {}, card: () => {} } }), lang);
    expect(await audit(page)).toEqual([]);
  });
  for (const [name, state] of Object.entries(states)) {
    test(`${lang} card ${name} fits every viewport`, async ({ page, baseURL }) => {
      const view = createElement(CardView, { t, state, onStart: () => {}, onRetry: () => {} });
      await renderWithAppCss(page, baseURL as string, createElement("div", { className: "deposit" }, view), lang);
      expect(await audit(page)).toEqual([]);
    });
  }
}
