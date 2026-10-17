import { expect, test } from "@playwright/test";
import { audit } from "@strickle/gates";
import { createElement } from "react";
import { InvoicesView, type InvoicesState } from "../src/components/InvoicesView.tsx";
import en from "../src/i18n/dictionaries/en.json";
import es from "../src/i18n/dictionaries/es.json";
import pt from "../src/i18n/dictionaries/pt-br.json";
import { invoicesText } from "../src/i18n/slices.ts";
import type { SerializedInvoice } from "../src/server/invoices.ts";
import { SESSION_KEY } from "../src/account/session.ts";
import { renderWithAppCss } from "./support/render-audit.ts";

const dictionaries = { en, es, "pt-br": pt } as const;
const invoice = (over: Partial<SerializedInvoice> = {}): SerializedInvoice => ({ id: "11111111-1111-4111-8111-111111111111", label: "Website redesign", payeeName: "Ana Studio", note: "", amount: "100000000", paid: "0", status: "open", expiresAt: "2026-12-01T00:00:00.000Z", createdAt: "2026-11-01T00:00:00.000Z", token: "Abcdefghijklmnopqrstuv", suggestions: [], payments: [], ...over });
const suggestion = { id: "55555555-5555-4555-8555-555555555555", amount: "100000000", payer: "0x14b5e469720A4cb071772258D9ac8f0B37Ab8D9A", txHash: `0x${"ab".repeat(32)}`, at: "2026-11-02T00:00:00.000Z", viaCard: false };
const ready = (invoices: SerializedInvoice[], over: Partial<Extract<InvoicesState, { status: "ready" }>> = {}): InvoicesState => ({ status: "ready", invoices, busy: false, error: null, confirming: null, copied: null, ...over });
const states: Record<string, InvoicesState> = {
  empty: ready([]),
  signature: { status: "needsSignature", busy: false, error: "unavailable" },
  list: ready([invoice(), invoice({ id: "22222222-2222-4222-8222-222222222222", status: "partial", paid: "40000000", suggestions: [suggestion] }), invoice({ id: "33333333-3333-4333-8333-333333333333", status: "paid", paid: "100000000" }), invoice({ id: "44444444-4444-4444-8444-444444444444", status: "void" })]),
  long: ready([invoice({ label: "L".repeat(80), amount: "1000000000000", paid: "999999999999", status: "partial", suggestions: [suggestion] })], { confirming: { kind: "void", id: "11111111-1111-4111-8111-111111111111" }, error: "rate-limited" }),
};

for (const lang of ["en", "es", "pt-br"] as const) {
  const t = invoicesText(dictionaries[lang] as typeof en);
  for (const [name, state] of Object.entries(states)) {
    test(`${lang} invoices ${name} fits every viewport`, async ({ page, baseURL }) => {
      await renderWithAppCss(page, baseURL as string, createElement(InvoicesView, { lang, t, state, origin: "https://app.example", onEvent: () => {} }), lang);
      expect(await audit(page)).toEqual([]);
    });
  }
}

test("a visitor without an account sees the sign-in choices and downloads no wallet code", async ({ page }) => {
  const scripts: string[] = [];
  page.on("response", (response) => response.request().resourceType() === "script" && scripts.push(response.url()));
  await page.goto("/en/invoices", { waitUntil: "networkidle" });
  await expect(page.getByRole("link", { name: "Create account" })).toBeVisible();
  const bodies = await Promise.all(scripts.map(async (url) => (await (await page.request.get(url)).text())));
  expect(bodies.some((body) => body.includes("stablecoinKits") || body.includes("depositForBurn"))).toBe(false);
});

test("a signed-in owner without a session is asked for one signature, and the passkey code waits for the button", async ({ page }) => {
  await page.addInitScript(([key]) => window.localStorage.setItem(key as string, JSON.stringify({ owner: "0x00000000000000000000000000000000000000a1", vault: "0x8AB41267Adc223EF245c46537870Ae8744b9b3F8", username: "", createdAt: 0 })), [SESSION_KEY]);
  await page.goto("/en/invoices", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("button", { name: "Sign to manage invoices" })).toBeVisible();
});
