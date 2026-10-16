import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { usdtChainsFor } from "../src/bridge/chains.ts";
import { MAX_COST_BPS, SWAP_QUOTE_TTL_MS, composeUsdtQuote, expectedReceived, normalizeSwapEstimate } from "../src/bridge/swap.ts";
import { QuoteRefusal, type DepositQuote } from "../src/bridge/types.ts";

const fixture = (name: string) => JSON.parse(readFileSync(new URL(`./fixtures/bridge/${name}`, import.meta.url), "utf8"));
const chain = (id: string) => usdtChainsFor("mainnet").find((entry) => entry.id === id) as ReturnType<typeof usdtChainsFor>[number];
const leg = (name: string, id: string, amountIn: bigint) => normalizeSwapEstimate(fixture(name), { source: chain(id), amountIn, slippageBps: 50 });

describe("normalizeSwapEstimate", () => {
  const swap = leg("swap-ethereum-100.json", "Ethereum", 100_000_000n);
  const raw = fixture("swap-ethereum-100.json");

  it("reads the expected output, the guaranteed minimum and the provider fee in base units", () => {
    expect(swap.estimatedOut).toBe(BigInt(Math.round(Number(raw.estimatedOutput.amount) * 1e6)));
    expect(swap.minOut).toBe(BigInt(Math.round(Number(raw.stopLimit.amount) * 1e6)));
    expect(swap.providerFee).toBe(20_000n); // 0.02 USDT
    expect(swap.minOut).toBeLessThan(swap.estimatedOut);
  });

  it("keeps the native-token network fee and names the route", () => {
    expect(swap.gas?.token).toBe("ETH");
    expect(swap.route).toBe(raw.route.steps.map((step: { toolName: string }) => step.toolName).join(" + "));
    expect(swap.kind).toBe("swap");
  });

  it("works for the chain whose USDT is addressed, not named (Base)", () => {
    const base = leg("swap-base-100.json", "Base", 100_000_000n);
    expect(base.tokenIn.address).toBe("0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2");
    expect(base.estimatedOut).toBeGreaterThan(99_000_000n);
  });

  it("refuses a conversion that costs more than the stated share of the amount", () => {
    const costly = fixture("swap-ethereum-100.json");
    costly.estimatedOutput.amount = "98.9";
    costly.stopLimit.amount = "98.4";
    expect(() => normalizeSwapEstimate(costly, { source: chain("Ethereum"), amountIn: 100_000_000n, slippageBps: 50 })).toThrow(QuoteRefusal);
    try {
      normalizeSwapEstimate(costly, { source: chain("Ethereum"), amountIn: 100_000_000n, slippageBps: 50 });
    } catch (error) {
      expect((error as QuoteRefusal).code).toBe("cost-too-high");
    }
    expect(MAX_COST_BPS).toBe(100);
  });

  it("offers a real tiny conversion whose quote is still proportionate", () => {
    expect(leg("swap-tiny.json", "Ethereum", 10_000n).estimatedOut).toBeGreaterThan(9_900n);
  });

  it("refuses an estimate whose guaranteed minimum is not below its expected output or is above the amount", () => {
    const bad = fixture("swap-ethereum-100.json");
    bad.stopLimit.amount = "100.5";
    expect(() => normalizeSwapEstimate(bad, { source: chain("Ethereum"), amountIn: 100_000_000n, slippageBps: 50 })).toThrow(QuoteRefusal);
  });

  it("refuses a fee it cannot read", () => {
    const bad = fixture("swap-ethereum-100.json");
    bad.fees = bad.fees.filter((fee: { type: string }) => fee.type !== "provider");
    expect(() => normalizeSwapEstimate(bad, { source: chain("Ethereum"), amountIn: 100_000_000n, slippageBps: 50 })).toThrow(/fee-unknown|provider fee/);
  });
});

describe("composeUsdtQuote", () => {
  const swap = leg("swap-ethereum-100.json", "Ethereum", 100_000_000n);
  const bridge: DepositQuote = {
    network: "mainnet",
    sourceAddress: "0x14b5e469720A4cb071772258D9ac8f0B37Ab8D9A",
    vault: "0x8AB41267Adc223EF245c46537870Ae8744b9b3F8",
    amountSent: swap.minOut,
    totalDebit: swap.minOut,
    amountReceivedMin: swap.minOut - 16_000n,
    exact: false,
    legs: [{ kind: "bridge", source: swap.source, speed: "fast", feeMode: "destination", fees: [{ kind: "forwarder", amount: 16_000n }], gas: null }],
    expiresAt: null,
    opaque: null,
  };
  const now = 1_792_000_000_000;
  const quote = composeUsdtQuote(swap, bridge, now);

  it("refuses a bridge leg that wants its fees paid on top, because the wallet will hold only what the swap delivers", () => {
    const exact = { ...bridge, exact: true, legs: [{ ...bridge.legs[0], feeMode: "source" as const }] } as DepositQuote;
    expect(() => composeUsdtQuote(swap, exact, 1_792_000_000_000)).toThrow(QuoteRefusal);
  });

  it("puts the swap in front of the bridge and keeps the bridge leg untouched", () => {
    expect(quote.legs.map((entry) => entry.kind)).toEqual(["swap", "bridge"]);
    expect(quote.legs[1]).toBe(bridge.legs[0]);
  });

  it("denominates what is sent in USDT, promises only the floor and never claims exactness", () => {
    expect(quote.amountSent).toBe(100_000_000n);
    expect(quote.totalDebit).toBe(100_000_000n);
    expect(quote.amountReceivedMin).toBe(bridge.amountReceivedMin);
    expect(quote.exact).toBe(false);
  });

  it("is valid for a fixed window, since the swap estimate carries no expiry", () => {
    expect(quote.expiresAt).toBe(now + SWAP_QUOTE_TTL_MS);
  });

  it("shows an expected amount that is between the floor and the amount sent", () => {
    const expected = expectedReceived(quote);
    expect(expected).toBeGreaterThanOrEqual(quote.amountReceivedMin);
    expect(expected).toBeLessThanOrEqual(quote.amountSent);
  });
});
