import { type Address, type PublicClient } from "viem";
import type { PoolLedger } from "./ledger.ts";
export declare function appendLogs(ledger: PoolLedger, logs: readonly {
    index: number;
    commitment0: bigint;
    commitment1: bigint;
}[]): void;
export declare function syncLedger(args: {
    client: PublicClient;
    pool: Address;
    fromBlock: bigint;
    ledger: PoolLedger;
    step?: bigint;
}): Promise<bigint>;
