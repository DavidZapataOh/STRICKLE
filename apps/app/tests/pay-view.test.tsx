import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PayView } from "../src/components/PayView.tsx";
import en from "../src/i18n/dictionaries/en.json";
import es from "../src/i18n/dictionaries/es.json";
import { payText } from "../src/i18n/slices.ts";
import type { PublicInvoice } from "../src/server/pay.ts";

const base: PublicInvoice = { label: "Website redesign", payeeName: "Ana Studio", note: "October", amount: "100000000", paid: "0", remaining: "100000000", status: "open", expiresAt: null, expired: false, closed: false, vault: "0x8AB41267Adc223EF245c46537870Ae8744b9b3F8", memoId: `0x${"ab".repeat(32)}`, chainId: 5042002, usdc: "0x3600000000000000000000000000000000000000", cardAvailable: false };
const view = (invoice: Partial<PublicInvoice> = {}, t: typeof en = en, lang: "en" | "es" | "pt-br" = "en", phase: "idle" | "needEoa" | "thanks" = "idle") =>
  renderToStaticMarkup(<PayView lang={lang} t={payText(t)} invoice={{ ...base, ...invoice }} phase={phase} actions={{ arc: () => {}, other: () => {}, copy: () => {} }} otherOpen={false} />);

describe("PayView", () => {
  it("shows who is paid, what for and how much, with the three ways to pay", () => {
    const out = view();
    expect(out).toContain("Pay Ana Studio");
    expect(out).toContain("Website redesign");
    expect(out).toContain("October");
    expect(out).toContain("US$100.00");
    expect(out).toContain("Pay on Arc with your wallet");
    expect(out).toContain("Pay from another chain");
    expect(out).toContain("Pay another way");
    expect(out).toContain("0x8AB41267Adc223EF245c46537870Ae8744b9b3F8");
    expect(out).toContain("USDC on Arc only");
  });

  it("says what is left after an underpayment", () => {
    expect(view({ status: "partial", paid: "40000000", remaining: "60000000" })).toContain("Paid so far US$40.00 of US$100.00; US$60.00 left");
  });

  it("offers nothing to pay on a paid or void invoice, and nothing on an expired one", () => {
    for (const closed of [{ status: "paid" as const, paid: "100000000", remaining: "0", closed: true }, { status: "void" as const, closed: true }]) {
      const out = view(closed);
      expect(out).not.toContain("<button");
      expect(out).toContain("There is nothing left to pay");
    }
    const expired = view({ expired: true, expiresAt: "2026-01-01T00:00:00.000Z" });
    expect(expired).toContain("This link has expired. Ask Ana Studio for a new one.");
    expect(expired).not.toContain("<button");
  });

  it("tells a smart-account wallet to use the address", () => {
    expect(view({}, en, "en", "needEoa")).toContain("This wallet cannot attach the reference");
  });

  it("never prints the reference or a token, and promises no speed, card or exchange", () => {
    for (const text of [en, es]) {
      const out = view({}, text as typeof en, text === es ? "es" : "en");
      expect(out).not.toContain("ab".repeat(32));
      expect(out).not.toMatch(/tokenHash|token_hash/);
      // the visible text only: "card" is also the name of a CSS class
      expect(out.replace(/<[^>]+>/g, " ")).not.toMatch(/minutes?|seconds?|minutos|segundos|\bcard\b|tarjeta|exchange|binance|kraken/i);
    }
  });

  it("is rendered in Spanish from the same state", () => {
    expect(view({}, es as typeof en, "es")).toContain("Pagar a Ana Studio");
  });
});
