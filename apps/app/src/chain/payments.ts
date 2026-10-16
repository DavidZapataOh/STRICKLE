import { BOX_KINDS, type BoxKind } from "@strickle/core";
import { type RawLog, decodeAllocated } from "./logs.ts";

export interface Payment {
  txHash: `0x${string}`;
  at: number;
  asset: "USDC" | "EURC";
  total: bigint;
  byBox: Partial<Record<BoxKind, bigint>>;
  byAgent: boolean;
}

const ASSET = { 1: "USDC", 2: "EURC" } as const;

export function paymentsFrom(allocated: RawLog[], splits: RawLog[]): Payment[] {
  const agentTxs = new Set(splits.map((log) => log.transactionHash));
  const groups = new Map<string, { last: RawLog; payment: Payment }>();
  for (const log of allocated) {
    let decoded: ReturnType<typeof decodeAllocated>;
    try {
      decoded = decodeAllocated(log);
    } catch {
      continue;
    }
    const kind = BOX_KINDS[decoded.box - 1];
    const assetName = ASSET[decoded.asset as 1 | 2];
    if (!kind || !assetName) continue;
    const key = `${log.transactionHash}:${decoded.asset}`;
    const group = groups.get(key) ?? { last: log, payment: { txHash: log.transactionHash, at: log.timestamp, asset: assetName, total: 0n, byBox: {}, byAgent: agentTxs.has(log.transactionHash) } };
    group.payment.total += decoded.amount;
    group.payment.byBox[kind] = (group.payment.byBox[kind] ?? 0n) + decoded.amount;
    if (log.blockNumber > group.last.blockNumber || (log.blockNumber === group.last.blockNumber && log.logIndex > group.last.logIndex)) group.last = log;
    groups.set(key, group);
  }
  return [...groups.values()]
    .sort((a, b) => (a.last.blockNumber === b.last.blockNumber ? b.last.logIndex - a.last.logIndex : a.last.blockNumber < b.last.blockNumber ? 1 : -1))
    .map((group) => group.payment);
}
