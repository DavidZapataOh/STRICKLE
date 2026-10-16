import { type Address, parseUnits } from "viem";
import { z } from "zod";
import { formatAmount } from "./amount.ts";
import type { DepositAdapter, DepositKit } from "./kit.ts";
import { quoteDeposit } from "./quote.ts";
import type { DepositSwapKit } from "./swap-kit.ts";
import { type DepositQuote, QuoteRefusal, type SourceChain, type SwapLeg, type TransferSpeed } from "./types.ts";

export const SLIPPAGE_BPS = 50;
export const MAX_COST_BPS = 100;
export const SWAP_QUOTE_TTL_MS = 60_000;

const money = z.object({ amount: z.string(), token: z.string() });
const estimate = z.object({
  stopLimit: money,
  estimatedOutput: money,
  fees: z.array(z.object({ type: z.string(), token: z.string(), amount: z.string() })),
  route: z.object({ steps: z.array(z.object({ toolName: z.string() })) }),
});

const units = (value: string): bigint => parseUnits(value, 6);

export function normalizeSwapEstimate(raw: unknown, input: { source: SourceChain & { usdt: { address: Address } }; amountIn: bigint; slippageBps: number }): SwapLeg {
  const parsed = estimate.parse(raw);
  const provider = parsed.fees.find((fee) => fee.type === "provider");
  if (!provider) throw new QuoteRefusal("fee-unknown", "the provider fee of the conversion could not be read");
  const gas = parsed.fees.find((fee) => fee.type === "gas");
  const estimatedOut = units(parsed.estimatedOutput.amount);
  const minOut = units(parsed.stopLimit.amount);
  if (minOut <= 0n || minOut >= estimatedOut || minOut > input.amountIn) throw new QuoteRefusal("unavailable", "the conversion quote is inconsistent");
  if (estimatedOut * 10_000n < input.amountIn * BigInt(10_000 - MAX_COST_BPS)) throw new QuoteRefusal("cost-too-high", "converting this amount costs too much of it; try a larger amount");
  return {
    kind: "swap",
    source: input.source,
    tokenIn: { symbol: "USDT", address: input.source.usdt.address },
    amountIn: input.amountIn,
    estimatedOut,
    minOut,
    providerFee: units(provider.amount),
    slippageBps: input.slippageBps,
    gas: gas ? { token: gas.token, amount: gas.amount } : null,
    route: parsed.route.steps.map((step) => step.toolName).join(" + "),
  };
}

export function composeUsdtQuote(swap: SwapLeg, bridge: DepositQuote, now: number): DepositQuote {
  if (bridge.legs.some((leg) => leg.kind === "bridge" && leg.feeMode === "source")) throw new QuoteRefusal("unavailable", "the transfer after a conversion must be destination-paid");
  return { ...bridge, amountSent: swap.amountIn, totalDebit: swap.amountIn, exact: false, legs: [swap, ...bridge.legs], expiresAt: now + SWAP_QUOTE_TTL_MS };
}

export { expectedReceived } from "./types.ts";

export interface UsdtQuoteInput {
  network: DepositQuote["network"];
  source: SourceChain;
  sourceAddress: Address;
  vault: Address;
  amountIn: bigint;
  speed: TransferSpeed;
  slippageBps?: number;
}

export async function quoteUsdtDeposit(deps: { swapKit: DepositSwapKit; kit: DepositKit; adapter: DepositAdapter }, input: UsdtQuoteInput, now: number = Date.now()): Promise<DepositQuote> {
  const usdt = input.source.usdt;
  if (!usdt) throw new QuoteRefusal("unsupported-chain", `USDT is not offered from ${input.source.label}`);
  const slippageBps = input.slippageBps ?? SLIPPAGE_BPS;
  const raw = await deps.swapKit.estimate({
    from: { adapter: deps.adapter, chain: input.source.id },
    tokenIn: usdt.address,
    tokenOut: "USDC",
    amountIn: formatAmount(input.amountIn),
    config: { slippageBps, allowanceStrategy: "approve" },
  } as Parameters<DepositSwapKit["estimate"]>[0]);
  const swap = normalizeSwapEstimate(raw, { source: { ...input.source, usdt }, amountIn: input.amountIn, slippageBps });
  const bridge = await quoteDeposit({ kit: deps.kit, adapter: deps.adapter }, { network: input.network, source: input.source, sourceAddress: input.sourceAddress, vault: input.vault, amountSent: swap.minOut, speed: input.speed, feePayment: "destination" });
  return composeUsdtQuote(swap, bridge, now);
}
