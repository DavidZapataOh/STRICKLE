import type { BoxKind } from "@strickle/core";
import type { Address, Hex } from "viem";

interface Where {
  vault: Address;
  txHash: Hex;
  blockNumber: bigint;
  logIndex: number;
  timestamp: number;
}

export type ChainReceipt =
  | (Where & { type: "split"; asset: 1 | 2; total: bigint; byBox: Partial<Record<BoxKind, bigint>> })
  | (Where & { type: "salary"; asset: 1 | 2; payee: Address; amount: bigint })
  | (Where & { type: "private-spend"; amount: bigint; recipient: Address });

export interface SealedNotice {
  id: bigint;
  sealed: Hex;
  txHash: Hex;
  blockNumber: bigint;
  logIndex: number;
  timestamp: number;
}

export interface Activity {
  receipts: ChainReceipt[];
  notices: SealedNotice[];
  head: bigint;
  truncated: boolean;
}
