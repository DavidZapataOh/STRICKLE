import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { type InvoicesState, InvoicesView, payUrl } from "../src/components/InvoicesView.tsx";
import en from "../src/i18n/dictionaries/en.json";
import es from "../src/i18n/dictionaries/es.json";
import { invoicesText } from "../src/i18n/slices.ts";
import type { SerializedInvoice } from "../src/server/invoices.ts";

const token = "Abcdefghijklmnopqrstuv";
const invoice = (over: Partial<SerializedInvoice> = {}): SerializedInvoice => ({ id: "11111111-1111-4111-8111-111111111111", label: "Website redesign", payeeName: "Ana Studio", note: "", amount: "100000000", paid: "0", status: "open", expiresAt: "2026-12-01T00:00:00.000Z", createdAt: "2026-11-01T00:00:00.000Z", token, suggestions: [], payments: [], ...over });
const card = (viaCard: boolean) => ({ id: "55555555-5555-4555-8555-555555555555", amount: "96500000", payer: "0x14b5e469720A4cb071772258D9ac8f0B37Ab8D9A", txHash: `0x${"ab".repeat(32)}`, at: "2026-11-02T00:00:00.000Z", viaCard });
const ready = (invoices: SerializedInvoice[], over: Partial<Extract<InvoicesState, { status: "ready" }>> = {}): InvoicesState => ({ status: "ready", invoices, busy: false, error: null, confirming: null, copied: null, ...over });
const view = (state: InvoicesState, t: typeof en = en, lang: "en" | "es" | "pt-br" = "en") => renderToStaticMarkup(<InvoicesView lang={lang} t={invoicesText(t)} state={state} origin="https://app.test" onEvent={() => {}} />);

describe("InvoicesView", () => {
  it("shows a skeleton, the sign-in choices, and the one signature button", () => {
    expect(view({ status: "loading" })).toContain("Loading your invoices");
    expect(view({ status: "signedOut" })).toContain("Create account");
    const needs = view({ status: "needsSignature", busy: false, error: null });
    expect(needs).toContain("Sign to manage invoices");
    expect(needs).toContain("30 minutes");
  });

  it("starts with the form and an honest empty state", () => {
    const out = view(ready([]));
    expect(out).toContain("No invoices yet");
    expect(out).toContain("Amount in USDC");
    expect(out).toContain("Create invoice");
  });

  it("lists invoices in every status with money formatted and the full pay link", () => {
    const out = view(ready([invoice(), invoice({ id: "22222222-2222-4222-8222-222222222222", status: "partial", paid: "40000000", token: "Bbcdefghijklmnopqrstuv" }), invoice({ id: "33333333-3333-4333-8333-333333333333", status: "paid", paid: "100000000" }), invoice({ id: "44444444-4444-4444-8444-444444444444", status: "void" })]));
    for (const word of ["Open", "Partly paid", "Paid", "Void"]) expect(out).toContain(word);
    expect(out).toContain("US$100.00");
    expect(out).toContain("Paid US$40.00 of US$100.00");
    expect(out).toContain(`https://app.test/en/pay/${token}`);
    expect(payUrl("https://app.test", "es", token)).toBe(`https://app.test/es/pay/${token}`);
  });

  it("asks before it rotates or voids, and says what each does", () => {
    const rotating = view(ready([invoice()], { confirming: { kind: "rotate", id: "11111111-1111-4111-8111-111111111111" } }));
    expect(rotating).toContain('role="alertdialog"');
    expect(rotating).toContain("the old link stops working");
    const voiding = view(ready([invoice()], { confirming: { kind: "void", id: "11111111-1111-4111-8111-111111111111" } }));
    expect(voiding).toContain('role="alertdialog"');
    expect(voiding).toContain("Voiding closes the link");
    expect(view(ready([invoice()]))).not.toContain('role="alertdialog"');
  });

  it("offers a payment nobody reported as a suggestion to confirm or dismiss", () => {
    const out = view(ready([invoice({ suggestions: [{ id: "55555555-5555-4555-8555-555555555555", amount: "100000000", payer: "0x14b5e469720A4cb071772258D9ac8f0B37Ab8D9A", txHash: `0x${"ab".repeat(32)}`, at: "2026-11-02T00:00:00.000Z", viaCard: false }] })]));
    expect(out).toContain("A payment of US$100.00 arrived from 0x14b5…8D9A. Is it for this invoice?");
    expect(out).toContain("Yes, it is");
    expect(out).toContain("Not this one");
  });

  it("says a suggestion may be a card payment only when it was matched to an open card session", () => {
    expect(view(ready([invoice({ suggestions: [card(true)] })]))).toContain("This may be a card payment");
    expect(view(ready([invoice({ suggestions: [card(false)] })]))).not.toContain("This may be a card payment");
  });

  it("names a failure in plain words and promises nothing about cards, exchanges or USDT", () => {
    expect(view(ready([], { error: "rate-limited" }))).toContain("Too many tries");
    for (const text of [en, es]) expect(view(ready([invoice()]), text as typeof en, text === es ? "es" : "en").replace(/<[^>]+>/g, " ")).not.toMatch(/\bcard\b|tarjeta|exchange|usdt/i);
  });

  it("is rendered in Spanish from the same state", () => {
    expect(view(ready([]), es as typeof en, "es")).toContain("Aún no hay facturas");
  });
});
