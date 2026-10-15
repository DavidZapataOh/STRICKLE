// packages/pool/src/ledger-sync.ts
import { type Address, type PublicClient, parseAbiItem } from "viem";
import type { PoolLedger } from "./ledger.ts";

const inserted = parseAbiItem("event NotesInserted(uint32 indexed index, uint256 commitment0, uint256 commitment1, bytes ciphertext)");
const currentRoot = parseAbiItem("function currentRoot() view returns (uint256)");

export function appendLogs(ledger: PoolLedger, logs: readonly { index: number; commitment0: bigint; commitment1: bigint }[]): void {
  for (const log of logs) {
    if (log.index < ledger.size) continue;
    if (log.index !== ledger.size) throw new Error(`event gap at index ${log.index}`);
    ledger.append(log.commitment0, log.commitment1);
  }
}

export async function syncLedger(args: { client: PublicClient; pool: Address; fromBlock: bigint; ledger: PoolLedger; step?: bigint }): Promise<bigint> {
  const step = args.step ?? 5_000n;
  const head = await args.client.getBlockNumber();
  for (let from = args.fromBlock; from <= head; from += step) {
    const to = from + step - 1n < head ? from + step - 1n : head;
    const logs = await args.client.getLogs({ address: args.pool, event: inserted, fromBlock: from, toBlock: to });
    appendLogs(args.ledger, logs.map((log) => ({ index: Number(log.args.index), commitment0: log.args.commitment0 as bigint, commitment1: log.args.commitment1 as bigint })));
  }
  const onChain = await args.client.readContract({ address: args.pool, abi: [currentRoot], functionName: "currentRoot" });
  if (onChain !== args.ledger.root) throw new Error("the ledger rebuilt from events does not match the pool root");
  return head;
}
