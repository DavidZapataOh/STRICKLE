import type { Hex } from "viem";
import { formatAmount } from "./amount.ts";
import { ARC_KIT_CHAIN } from "./chains.ts";
import type { DepositAdapter, DepositKit } from "./kit.ts";
import { assertConfirmable } from "./quote.ts";
import { type DepositQuote, bridgeLegOf } from "./types.ts";

export type DepositProgress = { stage: "approve" | "burn" | "attestation" | "arrival"; state: "pending" | "done" | "failed"; txHash?: Hex };

const STAGES: Record<string, DepositProgress["stage"]> = { approve: "approve", burn: "burn", fetchAttestation: "attestation", mint: "arrival" };
const STATES: Record<string, DepositProgress["state"] | undefined> = { pending: "pending", success: "done", error: "failed" };

export function progressOf(step: { name: string; state: string; txHash?: string }): DepositProgress | null {
  const stage = STAGES[step.name];
  const state = STATES[step.state];
  if (!stage || !state) return null;
  return { stage, state, ...(step.txHash ? { txHash: step.txHash as Hex } : {}) };
}

export const burnTxOf = (result: { steps: readonly { name: string; txHash?: string }[] }): Hex | null => (result.steps.find((step) => step.name === "burn")?.txHash as Hex | undefined) ?? null;

/** Sends the quoted transfer (one kit instance per deposit, so the progress listener dies with it). The returned burn hash is what the tracker follows if the page is closed before the kit's promise settles. */
export async function executeDeposit(deps: { kit: DepositKit; adapter: DepositAdapter }, quote: DepositQuote, onProgress: (progress: DepositProgress) => void): Promise<{ burnTx: Hex }> {
  assertConfirmable(quote);
  const leg = bridgeLegOf(quote);
  if (!leg) throw new Error("the quote has no bridge leg");
  deps.kit.on("*", (event: unknown) => {
    const step = event as { method?: string; values?: { name?: string; state?: string; txHash?: string } };
    const progress = step.values?.name && step.values.state ? progressOf({ name: step.values.name, state: step.values.state, txHash: step.values.txHash }) : null;
    if (progress) onProgress(progress);
  });
  const result = await deps.kit.bridge({
    from: { adapter: deps.adapter, chain: leg.source.id },
    to: { chain: ARC_KIT_CHAIN[quote.network], recipientAddress: quote.vault, useForwarder: true },
    amount: formatAmount(quote.amountSent),
    config: { transferSpeed: leg.speed === "fast" ? "FAST" : "SLOW", ...(leg.feeMode === "source" ? { feePayment: "source" as const } : {}) },
    ...(quote.opaque ? { quote: quote.opaque } : {}),
  } as Parameters<DepositKit["bridge"]>[0]);
  const burnTx = burnTxOf(result);
  if (!burnTx) throw new Error(`the transfer ended in state ${result.state} without a burn transaction`);
  return { burnTx };
}
