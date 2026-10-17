import { expect, test } from "@playwright/test";
import { audit } from "@strickle/gates";
import { createElement } from "react";
import { PayView } from "../src/components/PayView.tsx";
import en from "../src/i18n/dictionaries/en.json";
import es from "../src/i18n/dictionaries/es.json";
import pt from "../src/i18n/dictionaries/pt-br.json";
import { payText } from "../src/i18n/slices.ts";
import type { PublicInvoice } from "../src/server/pay.ts";
import { renderWithAppCss } from "./support/render-audit.ts";

const dictionaries = { en, es, "pt-br": pt } as const;
const open: PublicInvoice = { label: "Website redesign", payeeName: "Ana Studio", note: "October", amount: "100000000", paid: "0", remaining: "100000000", status: "open", expiresAt: null, expired: false, closed: false, vault: "0x8AB41267Adc223EF245c46537870Ae8744b9b3F8", memoId: `0x${"ab".repeat(32)}`, chainId: 5042002, usdc: "0x3600000000000000000000000000000000000000", cardAvailable: false };
const long: PublicInvoice = { ...open, payeeName: "P".repeat(60), note: "n".repeat(300), label: "L".repeat(40), amount: "1000000000000", remaining: "1000000000000" };
const states: Record<string, PublicInvoice> = {
  open,
  partial: { ...open, status: "partial", paid: "40000000", remaining: "60000000" },
  paid: { ...open, status: "paid", paid: "100000000", remaining: "0", closed: true },
  void: { ...open, status: "void", closed: true },
  expired: { ...open, expired: true, expiresAt: "2026-01-01T00:00:00.000Z" },
  long,
};

for (const lang of ["en", "es", "pt-br"] as const) {
  const t = payText(dictionaries[lang] as typeof en);
  for (const [name, invoice] of Object.entries(states)) {
    test(`${lang} payer page ${name} fits every viewport`, async ({ page, baseURL }) => {
      await renderWithAppCss(page, baseURL as string, createElement(PayView, { lang, t, invoice, phase: "idle", otherOpen: false, actions: { arc: () => {}, other: () => {}, copy: () => {} } }), lang);
      expect(await audit(page)).toEqual([]);
    });
  }
}

test("the pay page loads with its private headers and no sign of an invoice for an unknown link", async ({ page }) => {
  const response = await page.goto(`/en/pay/${"B".repeat(22)}`, { waitUntil: "networkidle" });
  const headers = response?.headers() ?? {};
  expect(headers["referrer-policy"]).toBe("no-referrer");
  expect(headers["x-robots-tag"]).toContain("noindex");
  expect(headers["content-security-policy"]).toContain("iris-api");
  await expect(page.getByText("This link does not exist or is no longer active.")).toBeVisible();
});
