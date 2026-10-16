import { createViemAdapterFromPrivateKey } from "@circle-fin/adapter-viem-v2";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { describe, expect, it } from "vitest";
import { sourceChain } from "../../src/bridge/chains.ts";
import { createDepositKit } from "../../src/bridge/kit.ts";
import { quoteDeposit } from "../../src/bridge/quote.ts";

const VAULT = "0x8AB41267Adc223EF245c46537870Ae8744b9b3F8" as const;
const key = generatePrivateKey();
const adapter = createViemAdapterFromPrivateKey({ privateKey: key });
const kit = createDepositKit();
const ask = (id: string, speed: "fast" | "slow") =>
  quoteDeposit({ kit, adapter }, { network: "testnet", source: sourceChain("testnet", id), sourceAddress: privateKeyToAccount(key).address, vault: VAULT, amountSent: 100_000_000n, speed });

describe("the quote against Circle's real estimator", () => {
  it("is receive-exact from Base Sepolia, with the vault (a contract) as recipient", async () => {
    const quote = await ask("Base_Sepolia", "slow");
    expect(quote.exact).toBe(true);
    expect(quote.amountReceivedMin).toBe(100_000_000n);
    expect(quote.totalDebit).toBeGreaterThan(100_000_000n);
    expect(quote.totalDebit).toBeLessThan(100_100_000n);
  });

  it("falls back to destination-paid from Avalanche Fuji and says the figure is a floor", async () => {
    const quote = await ask("Avalanche_Fuji", "fast");
    expect(quote.exact).toBe(false);
    expect(quote.amountReceivedMin).toBeLessThan(100_000_000n);
    expect(quote.amountReceivedMin).toBeGreaterThan(99_900_000n);
  });

  it("charges more for fast than for slow where the fast fee is above zero", async () => {
    const [fast, slow] = await Promise.all([ask("Base_Sepolia", "fast"), ask("Base_Sepolia", "slow")]);
    expect(fast.totalDebit).toBeGreaterThan(slow.totalDebit);
  });
});
