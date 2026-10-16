import { BOX_KINDS, type BoxKind } from "@strickle/core";
import { type Address, type Hex, decodeEventLog, getAddress, parseAbi } from "viem";
import type { RawLog } from "../chain/logs.ts";
import type { ChainReceipt, SealedNotice } from "./types.ts";

export const stateEvents = parseAbi(["event Notice(address indexed vault, uint64 indexed id, bytes sealedData)"]);
export const executorEvents = parseAbi([
  "event Split(address indexed vault, uint8 indexed asset, uint256 amount)",
  "event SalaryPaid(address indexed vault, uint8 indexed asset, address indexed payee, uint256 amount)",
  "event PrivateSpend(address indexed vault, uint256 nullifier0)",
]);
export const vaultEvents = parseAbi(["event Allocated(uint8 indexed asset, uint8 indexed box, uint256 amount, uint256 newBalance)"]);
export const poolEvents = parseAbi(["event Spent(uint256 nullifier0, uint256 nullifier1, uint8 indexed asset, uint64 publicAmount, address indexed recipient)"]);

const asAsset = (value: number): 1 | 2 => (value === 2 ? 2 : 1);

function attempt<T>(work: () => T): T | undefined {
  try {
    return work();
  } catch {
    return undefined;
  }
}

const decode = (abi: readonly unknown[], log: { topics: readonly Hex[]; data: Hex }) =>
  attempt(() => decodeEventLog({ abi: abi as never, topics: log.topics as [Hex, ...Hex[]], data: log.data }) as unknown as { eventName: string; args: Record<string, unknown> });

export function spentFrom(logs: readonly { address: Address; topics: readonly Hex[]; data: Hex }[], pool: Address): { amount: bigint; recipient: Address } | undefined {
  for (const entry of logs) {
    if (entry.address.toLowerCase() !== pool.toLowerCase()) continue;
    const event = decode(poolEvents, entry);
    if (event?.eventName === "Spent") return { amount: event.args.publicAmount as bigint, recipient: getAddress(event.args.recipient as string) };
  }
  return undefined;
}

export function decodeActivity(input: { executor: RawLog[]; allocated: RawLog[]; spent: ReadonlyMap<Hex, { amount: bigint; recipient: Address }>; state: RawLog[] }): { receipts: ChainReceipt[]; notices: SealedNotice[] } {
  const byTx = new Map<Hex, Partial<Record<BoxKind, bigint>>>();
  for (const log of input.allocated) {
    const event = decode(vaultEvents, log);
    if (event?.eventName !== "Allocated") continue;
    const box = BOX_KINDS[Number(event.args.box) - 1];
    if (!box) continue;
    const sums = byTx.get(log.transactionHash) ?? {};
    sums[box] = (sums[box] ?? 0n) + (event.args.amount as bigint);
    byTx.set(log.transactionHash, sums);
  }

  const receipts: ChainReceipt[] = [];
  for (const log of input.executor) {
    const event = decode(executorEvents, log);
    if (!event) continue;
    const where = { vault: getAddress(event.args.vault as string), txHash: log.transactionHash, blockNumber: log.blockNumber, logIndex: log.logIndex, timestamp: log.timestamp };
    if (event.eventName === "Split") receipts.push({ type: "split", ...where, asset: asAsset(Number(event.args.asset)), total: event.args.amount as bigint, byBox: byTx.get(log.transactionHash) ?? {} });
    else if (event.eventName === "SalaryPaid") receipts.push({ type: "salary", ...where, asset: asAsset(Number(event.args.asset)), payee: getAddress(event.args.payee as string), amount: event.args.amount as bigint });
    else if (event.eventName === "PrivateSpend") {
      const paid = input.spent.get(log.transactionHash);
      if (paid) receipts.push({ type: "private-spend", ...where, amount: paid.amount, recipient: paid.recipient });
    }
  }

  const notices: SealedNotice[] = [];
  for (const log of input.state) {
    const event = decode(stateEvents, log);
    if (event?.eventName === "Notice") notices.push({ id: event.args.id as bigint, sealed: event.args.sealedData as Hex, txHash: log.transactionHash, blockNumber: log.blockNumber, logIndex: log.logIndex, timestamp: log.timestamp });
  }
  notices.sort((x, y) => (x.id < y.id ? -1 : x.id > y.id ? 1 : 0));
  return { receipts, notices };
}
