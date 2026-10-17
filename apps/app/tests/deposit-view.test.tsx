import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DepositView } from "../src/components/DepositView.tsx";
import { initialDeposit } from "../src/deposit/flow.ts";
import { describeError, errorOf } from "../src/deposit/messages.ts";
import en from "../src/i18n/dictionaries/en.json";
import es from "../src/i18n/dictionaries/es.json";
import { depositText } from "../src/i18n/slices.ts";

const view = (state = initialDeposit("testnet"), t: typeof en = en, lang: "en" | "es" | "pt-br" = "en") =>
  renderToStaticMarkup(<DepositView lang={lang} t={depositText(t)} state={state} wallets={[]} vault="0x8AB41267Adc223EF245c46537870Ae8744b9b3F8" onEvent={() => {}} />);

describe("DepositView", () => {
  it("offers the listed chains and a decimal amount field, and keeps the deposit steps to chain, intent, amount and speed", () => {
    const out = view();
    expect(out).toContain("Base");
    expect(out).toContain('inputMode="decimal"');
  });

  it("tells the user when Circle applied another speed than the one chosen", () => {
    const waiting = { ...initialDeposit("testnet"), step: "waiting" as const, speed: "fast" as const, appliedSpeed: "slow" as const, burnTx: `0x${"ab".repeat(32)}` as const };
    expect(view(waiting)).toContain("Circle delivered this as a standard transfer");
    expect(view({ ...waiting, appliedSpeed: null })).not.toContain("Circle delivered this");
    expect(view({ ...waiting, appliedSpeed: "fast" })).not.toContain("Circle delivered this");
  });

  it("says exact or at least by what the quote is, and names every fee", () => {
    const quote = { exact: true, expiresAt: null, amountSent: 100_000_000n, totalDebit: 100_015_638n, amountReceivedMin: 100_000_000n, network: "testnet", sourceAddress: "0x1", vault: "0x2", opaque: null, legs: [{ kind: "bridge", speed: "slow", feeMode: "source", gas: null, source: { id: "Base_Sepolia", label: "Base" }, fees: [{ kind: "forwarder", amount: 15_638n }] }] } as never;
    const exact = view({ ...initialDeposit("testnet"), step: "quote", quote });
    expect(exact).toContain("US$100.00");
    expect(exact).toContain("exactly");
    expect(exact).toContain("Circle forwarding");
    expect(exact).toContain("Your wallet shows the network fee");
    const floor = view({ ...initialDeposit("testnet"), step: "quote", quote: { ...(quote as object), exact: false } as never });
    expect(floor).toContain("at least");
  });

  it("shows the direct-address panel with Arc and USDC only", () => {
    const out = view();
    expect(out).toContain("0x8AB41267Adc223EF245c46537870Ae8744b9b3F8");
    expect(out).toContain("Only USDC, only on Arc");
  });

  it("explains a waiting transfer as waiting, never as failed", () => {
    const out = view({ ...initialDeposit("testnet"), step: "waiting", burnTx: `0x${"ab".repeat(32)}` });
    expect(out).toContain("Waiting for Circle to deliver it");
    expect(out).not.toMatch(/failed|error/i);
  });

  it("promises nothing about speed, exchanges or USDT", () => {
    for (const text of [en, es]) {
      const out = view(initialDeposit("testnet"), text as typeof en);
      expect(out).not.toMatch(/minutes?|seconds?|segundos|minutos|binance|kraken|usdt/i);
    }
  });

  it("is rendered in Spanish from the same state", () => {
    expect(view(initialDeposit("testnet"), es as typeof en, "es")).toContain("Agregar dinero");
  });

  it("offers to ask for the quote again when it could not be had, and not before a wallet is connected", () => {
    const base = { ...initialDeposit("testnet"), step: "wallet" as const, sourceId: "Base_Sepolia", amount: 5_000_000n, error: "unavailable" as const };
    expect(view({ ...base, account: "0xabc" as never })).toContain(en.deposit.quote.refresh);
    expect(view(base)).not.toContain(en.deposit.quote.refresh);
  });

  it("shows the amount that was prefilled after sending a held conversion on", () => {
    const out = view({ ...initialDeposit("testnet"), step: "wallet", sourceId: "Base_Sepolia", amount: 99_400_000n });
    expect(out).toContain('value="99.4"');
  });

  it("lets a user whose transfer is stuck start another, and keeps a timed-out one in waiting", () => {
    const burnTx = `0x${"ab".repeat(32)}` as const;
    expect(view({ ...initialDeposit("testnet"), step: "failed", error: "unavailable", burnTx })).toContain(en.deposit.states.another);
    const waiting = view({ ...initialDeposit("testnet"), step: "waiting", error: "timeout", burnTx });
    expect(waiting).toContain(en.deposit.states.waiting);
    expect(waiting).toContain(en.deposit.errors.timeout);
    expect(waiting).toContain(en.deposit.states.retry);
  });

  it("shows the error that sent the user back, and a way to check again after a burn", () => {
    const failed = { ...initialDeposit("testnet"), step: "failed" as const, error: "timeout" as const, burnTx: `0x${"ab".repeat(32)}` as const };
    const out = view(failed);
    expect(out).toContain(en.deposit.errors.timeout);
    expect(out).toContain(en.deposit.states.retry);
  });
});

describe("errors", () => {
  it("says the wallet holds too little when the executor refuses for the balance", () => {
    expect(errorOf(Object.assign(new Error("x"), { name: "QuoteRefusal", code: "insufficient-balance" }))).toBe("insufficient-funds");
  });

  it("maps the kit's own messages", () => {
    expect(errorOf(new Error("Insufficient USDC balance on Base Sepolia. Required: 5, available: 1"))).toBe("insufficient-funds");
    expect(errorOf(new Error("The fee quote is not safe for submission. Call estimate again"))).toBe("quote-expired");
    expect(errorOf(new Error("Failed to switch to chain 84532: Unsupported method"))).toBe("wrong-chain");
  });

  it("maps what a wallet and the network throw to the flow's error codes", () => {
    expect(errorOf({ code: 4001 })).toBe("rejected");
    expect(errorOf({ code: 4902 })).toBe("wrong-chain");
    expect(errorOf(new Error("User rejected the request"))).toBe("rejected");
    expect(errorOf(new Error("execution reverted: ERC20: transfer amount exceeds balance"))).toBe("insufficient-funds");
    expect(errorOf(new Error("insufficient funds for gas * price + value"))).toBe("insufficient-funds");
    expect(errorOf(Object.assign(new Error("x"), { code: "expired", name: "QuoteRefusal" }))).toBe("quote-expired");
    expect(errorOf(Object.assign(new Error("x"), { code: "below-minimum", name: "QuoteRefusal" }))).toBe("quote-refused");
    expect(errorOf(new TypeError("Failed to fetch"))).toBe("unavailable");
    expect(errorOf("???")).toBe("unavailable");
  });

  it("describes every code in the language asked for", () => {
    for (const code of Object.keys(en.deposit.errors) as (keyof typeof en.deposit.errors)[]) {
      expect(describeError(code, depositText(en))).toBe(en.deposit.errors[code]);
      expect(describeError(code, depositText(es as typeof en))).toBe(es.deposit.errors[code]);
    }
  });
});

describe("the question about the money", () => {
  it("asks what the money is, with income checked first", () => {
    const out = view();
    expect(out).toContain("What is this money?");
    expect(out).toContain("Income: I was paid");
    expect(out).toContain("My own money moving");
    expect(out).toContain("Not sure — treat it as income");
    expect(out).toMatch(/name="deposit-intent" checked="" value="income"/);
    expect(out).not.toMatch(/name="deposit-intent" checked="" value="own"/);
  });
  it("explains the signature when the user says it is their own money, and says so when it could not be recorded", () => {
    const own = view({ ...initialDeposit("testnet"), intent: "own" });
    expect(own).toContain("Confirm that this is your own money");
    expect(own).toContain("one passkey signature");
    expect(view({ ...initialDeposit("testnet"), declareFailed: true })).toContain("it will be treated as income");
    expect(view()).not.toContain("Confirm that this is your own money");
  });
  it("is in Spanish too", () => {
    expect(view(initialDeposit("testnet"), es as typeof en, "es")).toContain("¿Qué es este dinero?");
  });
});
