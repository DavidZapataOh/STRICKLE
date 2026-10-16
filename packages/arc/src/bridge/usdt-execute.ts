import type { Hex, PublicClient } from "viem";
import { formatAmount } from "./amount.ts";
import { creditedTo } from "./arrival.ts";
import type { DepositProgress } from "./execute.ts";
import { executeDeposit } from "./execute.ts";
import type { DepositAdapter, DepositKit } from "./kit.ts";
import { assertConfirmable, quoteDeposit } from "./quote.ts";
import type { DepositSwapKit } from "./swap-kit.ts";
import { type BridgeLeg, type DepositQuote, QuoteRefusal, type SwapLeg } from "./types.ts";

export const PROMISE_TOLERANCE = 10_000n;

export type AfterSwap = { action: "bridge"; amount: bigint } | { action: "hold"; held: bigint };

/** The bridge leg is quoted again for what the swap really delivered; if it can no longer deliver what the user was shown (within a cent), nothing more is sent. */
export function decideAfterSwap(input: { credited: bigint; shownMin: bigint; requoted: DepositQuote | null }): AfterSwap {
  if (input.credited <= 0n || !input.requoted) return { action: "hold", held: input.credited };
  return input.requoted.amountReceivedMin + PROMISE_TOLERANCE >= input.shownMin ? { action: "bridge", amount: input.credited } : { action: "hold", held: input.credited };
}

/** The USDT is now USDC in the user's wallet; the deposit continues from the plain USDC flow with `held` prefilled. */
export class ConvertedNotBridged extends Error {
  readonly held: bigint;
  readonly swapTx: Hex;

  constructor(held: bigint, swapTx: Hex, message: string) {
    super(message);
    this.name = "ConvertedNotBridged";
    this.held = held;
    this.swapTx = swapTx;
  }
}

export async function executeUsdtDeposit(deps: { swapKit: DepositSwapKit; kit: DepositKit; adapter: DepositAdapter; client: PublicClient }, quote: DepositQuote, onProgress: (progress: DepositProgress) => void): Promise<{ swapTx: Hex; burnTx: Hex }> {
  assertConfirmable(quote);
  const swap = quote.legs.find((leg): leg is SwapLeg => leg.kind === "swap");
  const bridge = quote.legs.find((leg): leg is BridgeLeg => leg.kind === "bridge");
  if (!swap || !bridge) throw new Error("the quote does not describe a conversion followed by a transfer");

  const balance = (await deps.client.readContract({ address: swap.tokenIn.address, abi: erc20Balance, functionName: "balanceOf", args: [quote.sourceAddress] })) as bigint;
  if (balance < swap.amountIn) throw new QuoteRefusal("unavailable", "the wallet holds less USDT than the amount to convert");

  onProgress({ stage: "swap", state: "pending" });
  const result = await deps.swapKit.swap({
    from: { adapter: deps.adapter, chain: swap.source.id },
    tokenIn: swap.tokenIn.address,
    tokenOut: "USDC",
    amountIn: formatAmount(swap.amountIn),
    config: { slippageBps: swap.slippageBps, stopLimit: swap.minOut.toString(), allowanceStrategy: "approve" },
  } as Parameters<DepositSwapKit["swap"]>[0]);
  const swapTx = result.txHash as Hex;
  const receipt = await deps.client.waitForTransactionReceipt({ hash: swapTx });
  const credited = creditedTo(receipt, swap.source.usdc, quote.sourceAddress);
  onProgress({ stage: "swap", state: "done", txHash: swapTx, amount: credited });

  const requoted = await quoteDeposit({ kit: deps.kit, adapter: deps.adapter }, { network: quote.network, source: swap.source, sourceAddress: quote.sourceAddress, vault: quote.vault, amountSent: credited, speed: bridge.speed, feePayment: "destination" }).catch(() => null);
  const decision = decideAfterSwap({ credited, shownMin: quote.amountReceivedMin, requoted });
  if (decision.action === "hold" || !requoted) throw new ConvertedNotBridged(decision.action === "hold" ? decision.held : credited, swapTx, "the conversion is done but the transfer to Arc can no longer keep the quoted amount");

  const { burnTx } = await executeDeposit({ kit: deps.kit, adapter: deps.adapter }, requoted, onProgress);
  return { swapTx, burnTx };
}

const erc20Balance = [{ type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ name: "account", type: "address" }], outputs: [{ type: "uint256" }] }] as const;
