import { type MemoPayment, type ReceiptLog, readMemoPayments } from "@strickle/arc/memo";
import type { DepositRow } from "@strickle/db/deposits";
import type { InvoiceKeys } from "@strickle/db/invoice-keys";
import { type LinkView, type SettleResult, getCursor, getLinkByMemoId, setCursor, settlePayment, suggestMatch } from "@strickle/db/payments";
import type { Sql } from "postgres";
import type { Address, Hex } from "viem";

export interface ChainReader {
  receipt(hash: Hex): Promise<{ status: "success" | "reverted"; logs: ReceiptLog[]; blockNumber: bigint } | null>;
  blockTime(block: bigint): Promise<Date>;
  head(): Promise<bigint>;
  transfersTo(vault: Address, from: bigint, to: bigint): Promise<{ txHash: Hex; logIndex: number; payer: Address; amount: bigint; blockNumber: bigint }[]>;
}

interface Deps {
  sql: Sql;
  keys: InvoiceKeys;
  chain: ChainReader;
  chainId: number;
  usdc: Address;
}

const DEFAULT_WINDOW = 5_000n;
// below the smallest invoice a transfer can match nothing; counting it would only let dust inflate a window
const DUST = 10_000n;

/** A payer says "I paid in this transaction": the chain, not the payer, decides whether that is true. */
export async function claimPayment(deps: Deps, link: LinkView, txHash: Hex): Promise<{ result: "credited" | "extra" | "duplicate" | "none" | "pending" }> {
  const receipt = await deps.chain.receipt(txHash);
  if (!receipt) return { result: "pending" };
  if (receipt.status !== "success") return { result: "none" };
  const matching = readMemoPayments(receipt, deps.usdc).filter((payment) => payment.memoId.toLowerCase() === link.memoId.toLowerCase() && payment.vault.toLowerCase() === link.vault.toLowerCase());
  if (matching.length === 0) return { result: "none" };
  const at = await deps.chain.blockTime(receipt.blockNumber);
  let outcome: "credited" | "extra" | "duplicate" = "duplicate";
  for (const payment of matching) {
    const settled = await settlePayment(deps.sql, { chainId: deps.chainId, txHash, logIndex: payment.transferLogIndex, vault: link.vault, payer: payment.payer, amount: payment.amount, rail: "direct", memoId: link.memoId, at });
    if (settled.outcome === "credited" || settled.outcome === "extra") outcome = settled.outcome;
  }
  return { result: outcome };
}

/** Looks at the token's transfers into one vault since the cursor: memo payments settle, other transfers of an exact open amount are only suggested. The cursor moves last, so a crash re-scans and idempotency absorbs the repeat. */
export async function scanVault(deps: Deps & { maxBlocks?: bigint }, vault: Address): Promise<{ scanned: bigint; credited: number; suggested: number }> {
  const window = deps.maxBlocks ?? DEFAULT_WINDOW;
  const head = await deps.chain.head();
  const stored = await getCursor(deps.sql, vault);
  const from = stored ?? (head > window ? head - window : 0n);
  const to = head < from + window ? head : from + window;
  if (to <= from) return { scanned: 0n, credited: 0, suggested: 0 };
  const transfers = await deps.chain.transfersTo(vault, from + 1n, to);
  let credited = 0;
  let suggested = 0;
  const byTx = new Map<Hex, typeof transfers>();
  for (const transfer of transfers) byTx.set(transfer.txHash, [...(byTx.get(transfer.txHash) ?? []), transfer]);
  const times = new Map<bigint, Date>();
  const timeOf = async (block: bigint) => {
    const known = times.get(block);
    if (known) return known;
    const read = await deps.chain.blockTime(block);
    times.set(block, read);
    return read;
  };
  for (const [txHash, group] of byTx) {
    const receipt = await deps.chain.receipt(txHash);
    const memos: MemoPayment[] = receipt?.status === "success" ? readMemoPayments(receipt, deps.usdc) : [];
    for (const transfer of group) {
      if (transfer.amount < DUST) continue;
      const at = await timeOf(transfer.blockNumber);
      // a bridged payment bound to a link settles from its forward transaction, whether or not the payer's page ever saw it arrive
      const [bound] = await deps.sql<{ link_id: string }[]>`select link_id from deposit_intents where forward_tx = ${txHash.toLowerCase()} and link_id is not null and vault = ${vault.toLowerCase()} limit 1`;
      if (bound) {
        const settled = await settlePayment(deps.sql, { chainId: deps.chainId, txHash, logIndex: transfer.logIndex, vault, payer: transfer.payer, amount: transfer.amount, rail: "cctp", linkId: bound.link_id, at });
        if (settled.outcome === "credited" || settled.outcome === "extra") credited++;
        continue;
      }
      const memo = memos.find((payment) => payment.transferLogIndex === transfer.logIndex && payment.vault.toLowerCase() === vault.toLowerCase());
      const link = memo ? await getLinkByMemoId(deps.sql, deps.keys, vault, memo.memoId) : null;
      if (memo && link) {
        const settled = await settlePayment(deps.sql, { chainId: deps.chainId, txHash, logIndex: transfer.logIndex, vault, payer: transfer.payer, amount: transfer.amount, rail: "direct", memoId: memo.memoId, at });
        if (settled.outcome === "credited" || settled.outcome === "extra") credited++;
      } else if ((await suggestMatch(deps.sql, { chainId: deps.chainId, txHash, logIndex: transfer.logIndex, vault, payer: transfer.payer, amount: transfer.amount, at })).suggested) {
        suggested++;
      }
    }
  }
  await setCursor(deps.sql, vault, to);
  return { scanned: to - from, credited, suggested };
}

/** What the deposit handler calls when a bridged payment arrives: the link the page bound the burn to decides the invoice. */
export function settleBoundDeposit(deps: Pick<Deps, "sql" | "chainId">, row: DepositRow, arrival: { forwardTx: Hex; received: bigint; payer: Address; logIndex: number; at: Date }): Promise<SettleResult> {
  return settlePayment(deps.sql, { chainId: deps.chainId, txHash: arrival.forwardTx, logIndex: arrival.logIndex, vault: row.vault, payer: arrival.payer, amount: arrival.received, rail: "cctp", linkId: row.linkId, at: arrival.at });
}
