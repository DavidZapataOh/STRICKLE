import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CardView } from "../src/components/CardPay.tsx";
import { PayView } from "../src/components/PayView.tsx";
import en from "../src/i18n/dictionaries/en.json";
import es from "../src/i18n/dictionaries/es.json";
import { payText } from "../src/i18n/slices.ts";
import { type CardState, cardReducer } from "../src/payments/card-events.ts";
import type { PublicInvoice } from "../src/server/pay.ts";

const base: PublicInvoice = { label: "Website redesign", payeeName: "Ana Studio", note: "", amount: "100000000", paid: "0", remaining: "100000000", status: "open", expiresAt: null, expired: false, closed: false, vault: "0x8AB41267Adc223EF245c46537870Ae8744b9b3F8", memoId: `0x${"ab".repeat(32)}`, chainId: 5042002, usdc: "0x3600000000000000000000000000000000000000", cardAvailable: true };
const pay = (invoice: Partial<PublicInvoice> = {}, t: typeof en = en, lang: "en" | "es" | "pt-br" = "en") =>
  renderToStaticMarkup(<PayView lang={lang} t={payText(t)} invoice={{ ...base, ...invoice }} phase="idle" otherOpen={false} actions={{ arc: () => {}, other: () => {}, copy: () => {}, card: () => {} }} />);
const card = (state: CardState, t: typeof en = en) => renderToStaticMarkup(<CardView t={payText(t)} state={state} onStart={() => {}} onRetry={() => {}} />);
const text = (html: string) => html.replace(/<[^>]+>/g, " ");

describe("the card option on the payer's page", () => {
  it("is offered only when the server is configured and the invoice is open", () => {
    expect(pay()).toContain("Pay with card");
    expect(pay({ cardAvailable: false })).not.toContain("Pay with card");
    expect(pay({ closed: true, cardAvailable: false, status: "paid" })).not.toContain("Pay with card");
    expect(pay({ expired: true, cardAvailable: false })).not.toContain("Pay with card");
  });

  it("says the payer bears the card's fees and the invoice is credited with what arrives, in two languages", () => {
    expect(text(pay())).toContain("The card service charges you fees; the invoice is credited with what arrives.");
    expect(text(pay({}, es as typeof en, "es"))).toContain("Pagar con tarjeta");
  });

  it("states no minutes, countries, fee figures or brands beyond Apple Pay and Google Pay", () => {
    const out = text(pay());
    expect(out).not.toMatch(/minutes?|seconds?|countries|visa|mastercard|%|fee of/i);
    expect(out).toContain("Apple Pay");
    expect(out).toContain("Google Pay");
  });
});

describe("CardView", () => {
  it("shows a button, a busy state, the widget container, the wait, the thanks and each failure", () => {
    expect(card({ step: "idle" })).toContain("Pay with card");
    expect(card({ step: "minting" })).toContain("Preparing");
    const widget = card({ step: "widget", sessionId: "s" });
    expect(widget).toContain('id="onramp-root"');
    expect(widget).toMatch(/height:\s*(5[6-9]\d|[6-9]\d\d)px/);
    expect(card({ step: "waiting", sessionId: "s" })).toContain("Waiting for the payment to be confirmed");
    expect(card({ step: "settled" })).toContain("Payment received.");
    expect(card({ step: "failed", reason: "blocked" })).toContain("in-app browser");
    for (const reason of ["unavailable", "closed", "expired", "not-completed"] as const) expect(text(card({ step: "failed", reason }))).toMatch(/\w{4}/);
  });
});

describe("cardReducer", () => {
  const widget: CardState = cardReducer(cardReducer({ step: "idle" }, { type: "press" }), { type: "minted", sessionId: "s" });
  it("walks idle, minting, widget, submitted, waiting, settled", () => {
    expect(cardReducer({ step: "idle" }, { type: "press" }).step).toBe("minting");
    expect(widget).toEqual({ step: "widget", sessionId: "s" });
    const submitted = cardReducer(widget, { type: "submitted" });
    expect(submitted).toEqual({ step: "submitted", sessionId: "s" });
    expect(cardReducer(submitted, { type: "polled" })).toEqual({ step: "waiting", sessionId: "s" });
    expect(cardReducer({ step: "waiting", sessionId: "s" }, { type: "settled" })).toEqual({ step: "settled" });
  });
  it("ends in a named failure for each thing that can go wrong, and can start again", () => {
    expect(cardReducer(widget, { type: "not-completed" })).toEqual({ step: "failed", reason: "not-completed" });
    expect(cardReducer({ step: "minting" }, { type: "closed" })).toEqual({ step: "failed", reason: "closed" });
    expect(cardReducer({ step: "minting" }, { type: "blocked" })).toEqual({ step: "failed", reason: "blocked" });
    expect(cardReducer({ step: "minting" }, { type: "unavailable" })).toEqual({ step: "failed", reason: "unavailable" });
    expect(cardReducer({ step: "waiting", sessionId: "s" }, { type: "expired" })).toEqual({ step: "failed", reason: "expired" });
    expect(cardReducer({ step: "failed", reason: "unavailable" }, { type: "reset" })).toEqual({ step: "idle" });
  });
  it("never leaves a settled payment", () => {
    expect(cardReducer({ step: "settled" }, { type: "not-completed" })).toEqual({ step: "settled" });
    expect(cardReducer({ step: "settled" }, { type: "press" })).toEqual({ step: "settled" });
  });
});
