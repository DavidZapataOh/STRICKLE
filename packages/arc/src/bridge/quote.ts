import { type Address, formatUnits, parseUnits } from "viem";
import type { ArcNetworkName } from "../networks.ts";
import { ARC_KIT_CHAIN } from "./chains.ts";
import { formatAmount } from "./amount.ts";
import type { DepositAdapter, DepositKit } from "./kit.ts";
import { type DepositQuote, type Fee, type FeeMode, QuoteRefusal, type SourceChain, type TransferSpeed } from "./types.ts";

export interface QuoteInput {
  network: ArcNetworkName;
  source: SourceChain;
  sourceAddress: Address;
  vault: Address;
  amountSent: bigint;
  speed: TransferSpeed;
  /** "auto" tries receive-exact and falls back; "destination" never asks for it (a leg that follows a swap holds only what the swap delivered, so it cannot pay fees on top). */
  feePayment?: "auto" | "destination";
}

interface RawEstimate {
  amount: string;
  gasFees: { token: string; fees: { fee: string } | null }[];
  fees: { type: "kit" | "provider" | "forwarder"; token: string; amount: string | null }[];
  amountReceived?: string;
  totalDebit?: string;
  quote?: unknown;
  quoteExpiry?: { mode: "TIMESTAMP"; expiresAt: number } | { mode: "BLOCK_NUMBER"; expiresAtBlock: number; blockEstimatedAt?: number };
}

const BLOCK_QUOTE_TTL_MS = 60_000;

/** Receive-exact quotes expire; the kit states it by clock or by block, and a block may come without an estimate. A quote with no expiry that claims to be exact is refused, because it could not be told stale. */
function expiryOf(estimate: RawEstimate, exact: boolean, now: number): number | null {
  const expiry = estimate.quoteExpiry;
  if (!expiry) {
    if (exact) throw new QuoteRefusal("unavailable", "a receive-exact quote came with no expiry");
    return null;
  }
  if (expiry.mode === "TIMESTAMP") return expiry.expiresAt * 1000;
  return expiry.blockEstimatedAt ? expiry.blockEstimatedAt * 1000 : now + BLOCK_QUOTE_TTL_MS;
}

const units = (value: string): bigint => parseUnits(value, 6);

export function normalizeEstimate(raw: unknown, input: QuoteInput, now: number = Date.now()): DepositQuote {
  const estimate = raw as RawEstimate;
  const fees: Fee[] = estimate.fees.map((fee) => {
    if (fee.amount === null) throw new QuoteRefusal("fee-unknown", "a fee of this transfer could not be computed");
    if (fee.type === "kit") throw new QuoteRefusal("unavailable", "the kit added a fee of its own; Strickle charges none");
    return { kind: fee.type, amount: units(fee.amount) };
  });
  const feeTotal = fees.reduce((sum, fee) => sum + fee.amount, 0n);
  const exact = estimate.amountReceived !== undefined;
  const feeMode: FeeMode = exact ? "source" : "destination";
  const amountReceivedMin = exact ? units(estimate.amountReceived as string) : input.amountSent - feeTotal;
  if (amountReceivedMin <= 0n) throw new QuoteRefusal("below-minimum", "the fees are higher than the amount");
  const gasSteps = estimate.gasFees.filter((gas) => gas.fees);
  const gasWei = gasSteps.reduce((sum, gas) => sum + parseUnits(gas.fees?.fee ?? "0", 18), 0n);
  return {
    network: input.network,
    sourceAddress: input.sourceAddress,
    vault: input.vault,
    amountSent: input.amountSent,
    totalDebit: exact ? units(estimate.totalDebit as string) : input.amountSent,
    amountReceivedMin,
    exact,
    legs: [{ kind: "bridge", source: input.source, speed: input.speed, feeMode, fees, gas: gasSteps[0] ? { token: gasSteps[0].token, amount: formatUnits(gasWei, 18) } : null }],
    expiresAt: expiryOf(estimate, exact, now),
    opaque: estimate.quote ?? null,
  };
}

/** A receive-exact quote is signed for a block; sending one that is about to lapse fails after the user has already approved. */
export function assertConfirmable(quote: DepositQuote, now: number = Date.now(), marginMs = 20_000): void {
  if (quote.expiresAt !== null && quote.expiresAt - marginMs <= now) throw new QuoteRefusal("expired", "the quote has expired; ask for a new one");
}

export const isFeeModeUnsupported = (error: unknown): boolean => error instanceof Error && /Source-paid .* fees are not supported from /.test(error.message);

const params = (input: QuoteInput, adapter: DepositAdapter, feePayment: boolean): Parameters<DepositKit["estimate"]>[0] => ({
  from: { adapter, chain: input.source.id },
  to: { chain: ARC_KIT_CHAIN[input.network], recipientAddress: input.vault, useForwarder: true as const },
  amount: formatAmount(input.amountSent),
  config: { transferSpeed: input.speed === "fast" ? ("FAST" as const) : ("SLOW" as const), ...(feePayment ? { feePayment: "source" as const } : {}) },
}) as Parameters<DepositKit["estimate"]>[0];

/** Receive-exact where the kit supports the source chain, destination-paid where it does not; every other failure is the caller's. */
export async function quoteDeposit(deps: { kit: DepositKit; adapter: DepositAdapter }, input: QuoteInput): Promise<DepositQuote> {
  if (input.feePayment === "destination") return normalizeEstimate(await deps.kit.estimate(params(input, deps.adapter, false)), input);
  try {
    return normalizeEstimate(await deps.kit.estimate(params(input, deps.adapter, true)), input);
  } catch (error) {
    if (!isFeeModeUnsupported(error)) throw error;
    return normalizeEstimate(await deps.kit.estimate(params(input, deps.adapter, false)), input);
  }
}
