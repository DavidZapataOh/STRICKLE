import { createViemAdapterFromPrivateKey } from "@circle-fin/adapter-viem-v2";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { describe, expect, it } from "vitest";
import { usdtChainsFor } from "../../src/bridge/chains.ts";
import { createDepositKit } from "../../src/bridge/kit.ts";
import { createDepositSwapKit } from "../../src/bridge/swap-kit.ts";
import { expectedReceived, quoteUsdtDeposit } from "../../src/bridge/swap.ts";
import { QuoteRefusal } from "../../src/bridge/types.ts";

const key = generatePrivateKey();
const adapter = createViemAdapterFromPrivateKey({ privateKey: key });
const deps = { swapKit: createDepositSwapKit(), kit: createDepositKit(), adapter };
const VAULT = "0x8AB41267Adc223EF245c46537870Ae8744b9b3F8" as const; // any address is a valid recipient for a quote
const ask = (id: string, amountIn: bigint, speed: "fast" | "slow" = "fast") => {
  const source = usdtChainsFor("mainnet").find((chain) => chain.id === id);
  if (!source) throw new Error(`no USDT on ${id}`);
  return quoteUsdtDeposit(deps, { network: "mainnet", source, sourceAddress: privateKeyToAccount(key).address, vault: VAULT, amountIn, speed });
};

describe.each(usdtChainsFor("mainnet").map((chain) => chain.id))("converting 100 USDT on %s and carrying it to Arc", (id) => {
  it("quotes a floor within one percent of the amount, with the conversion and transfer fees named", async () => {
    const quote = await ask(id, 100_000_000n);
    expect(quote.legs.map((leg) => leg.kind)).toEqual(["swap", "bridge"]);
    expect(quote.amountReceivedMin).toBeGreaterThan(99_000_000n);
    expect(quote.amountReceivedMin).toBeLessThan(100_000_000n);
    const bridge = quote.legs[1];
    if (bridge?.kind !== "bridge") throw new Error("setup");
    expect(bridge.feeMode).toBe("destination"); // never receive-exact after a swap
    const swapLeg = quote.legs[0];
    if (swapLeg?.kind !== "swap") throw new Error("setup");
    expect(quote.amountReceivedMin).toBe(swapLeg.minOut - bridge.fees.reduce((sum, fee) => sum + fee.amount, 0n)); // the shown floor already pays the transfer fees
    expect(expectedReceived(quote)).toBeGreaterThanOrEqual(quote.amountReceivedMin);
  }, 60_000);

  it("uses the registry's USDT address as the token the route actually sells", async () => {
    const swapLeg = (await ask(id, 100_000_000n)).legs[0];
    const source = usdtChainsFor("mainnet").find((chain) => chain.id === id);
    if (swapLeg?.kind !== "swap" || !source) throw new Error("setup");
    const raw = await deps.swapKit.estimate({ from: { adapter, chain: id }, tokenIn: source.usdt.address, tokenOut: "USDC", amountIn: "100", config: { slippageBps: 50, allowanceStrategy: "approve" } } as never);
    const sold = (raw as unknown as { route: { steps: { fromToken: { address: string } }[] } }).route.steps[0]?.fromToken.address;
    expect(sold?.toLowerCase()).toBe(source.usdt.address.toLowerCase());
  }, 60_000);
});

describe("amounts that should not be converted", () => {
  it("refuses a cent of USDT: the transfer fees would eat all of it, so the real answer is a refusal, never a quote", async () => {
    await expect(ask("Ethereum", 10_000n)).rejects.toBeInstanceOf(QuoteRefusal);
  }, 60_000);
});
