import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { sourceChain } from "../src/bridge/chains.ts";
import { assertConfirmable, isFeeModeUnsupported, normalizeEstimate } from "../src/bridge/quote.ts";
import { QuoteRefusal, bridgeLegOf } from "../src/bridge/types.ts";

const fixture = (name: string) => JSON.parse(readFileSync(new URL(`./fixtures/bridge/${name}`, import.meta.url), "utf8"));
const input = (speed: "fast" | "slow" = "fast") => ({
  network: "testnet" as const,
  source: sourceChain("testnet", "Base_Sepolia"),
  sourceAddress: "0x14b5e469720A4cb071772258D9ac8f0B37Ab8D9A" as const,
  vault: "0x8AB41267Adc223EF245c46537870Ae8744b9b3F8" as const,
  amountSent: 100_000_000n,
  speed,
});

describe("destination-paid estimates", () => {
  const quote = normalizeEstimate(fixture("estimate-destination.json"), input());

  it("subtract every fee from what is sent and say the figure is a floor", () => {
    const fees = bridgeLegOf(quote)?.fees ?? [];
    expect(fees.map((fee) => fee.kind).sort()).toEqual(["forwarder", "provider"]);
    const total = fees.reduce((sum, fee) => sum + fee.amount, 0n);
    expect(quote.exact).toBe(false);
    expect(quote.totalDebit).toBe(100_000_000n);
    expect(quote.amountReceivedMin).toBe(100_000_000n - total);
  });

  it("carry the network fee of the source chain when the kit estimates it", () => {
    expect(bridgeLegOf(quote)?.gas?.token).toBe("ETH");
  });
});

describe("source-paid estimates (receive-exact)", () => {
  const quote = normalizeEstimate(fixture("estimate-source.json"), input("slow"));

  it("deliver exactly what was typed and debit it plus the fees", () => {
    expect(quote.exact).toBe(true);
    expect(quote.amountReceivedMin).toBe(100_000_000n);
    expect(quote.totalDebit).toBe(100_000_000n + (bridgeLegOf(quote)?.fees.reduce((sum, fee) => sum + fee.amount, 0n) ?? 0n));
  });

  it("expire at the time the kit estimates for the quoted block", () => {
    expect(quote.expiresAt).toBe(fixture("estimate-source.json").quoteExpiry.blockEstimatedAt * 1000);
  });

  it("expire by the clock for a timestamp quote, and after a short fixed time for a block quote that carries no estimate", () => {
    const now = 1_792_000_000_000;
    const stamped = { ...fixture("estimate-source.json"), quoteExpiry: { mode: "TIMESTAMP", expiresAt: 1_792_000_300 } };
    expect(normalizeEstimate(stamped, input("slow"), now).expiresAt).toBe(1_792_000_300_000);
    const bare = { ...fixture("estimate-source.json"), quoteExpiry: { mode: "BLOCK_NUMBER", expiresAtBlock: 48201818 } };
    expect(normalizeEstimate(bare, input("slow"), now).expiresAt).toBe(now + 60_000);
  });

  it("refuse a receive-exact quote that has no expiry at all", () => {
    const none = { ...fixture("estimate-source.json") };
    delete none.quoteExpiry;
    expect(() => normalizeEstimate(none, input("slow"))).toThrow(/expiry/);
  });

  it("have no gas figure, because the kit gives none here", () => {
    expect(bridgeLegOf(quote)?.gas).toBeNull();
  });
});

describe("refusals", () => {
  it("refuses a quote whose fees swallow the amount", () => {
    const raw = fixture("estimate-destination.json");
    expect(() => normalizeEstimate(raw, { ...input(), amountSent: 20_000n })).toThrow(QuoteRefusal);
  });

  it("refuses a fee the kit could not compute", () => {
    const raw = fixture("estimate-destination.json");
    raw.fees[0].amount = null;
    expect(() => normalizeEstimate(raw, input())).toThrow(/fee-unknown|could not be computed/);
  });

  it("refuses to confirm a quote that is expired or about to expire", () => {
    const quote = normalizeEstimate(fixture("estimate-source.json"), input("slow"));
    const at = (quote.expiresAt as number) - 10_000;
    expect(() => assertConfirmable(quote, at, 20_000)).toThrow(/expired/);
    expect(() => assertConfirmable(quote, (quote.expiresAt as number) - 60_000, 20_000)).not.toThrow();
  });

  it("accepts a quote that has no expiry", () => {
    expect(() => assertConfirmable(normalizeEstimate(fixture("estimate-destination.json"), input()), 0)).not.toThrow();
  });
});

describe("telling the kit's unsupported-fee-mode refusal from any other failure", () => {
  it("recognises the real message", () => {
    expect(isFeeModeUnsupported(new Error(fixture("error-source-unsupported.json").message))).toBe(true);
  });
  it("does not swallow anything else", () => {
    expect(isFeeModeUnsupported(new Error("fetch failed"))).toBe(false);
    expect(isFeeModeUnsupported("not an error")).toBe(false);
  });
});
