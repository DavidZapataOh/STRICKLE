import { type Asset, type PlainDate, daysBetween, parsePlainDate, formatPlainDate } from "@strickle/core";
import { type Address, type Hex, hexToBigInt, keccak256, toBytes, toEventSelector } from "viem";
import type { Profile } from "./profile.ts";
import { type RpcRequest, logsRangeRequest, topic } from "./rpc.ts";

const TRANSFER_TOPIC = keccak256(toBytes("Transfer(address,address,uint256)"));
const REDEEMED_TOPIC = toEventSelector("Redeemed(uint8,uint8,address,uint256,uint256)");
const SWAPPED_TOPIC = toEventSelector("Swapped(uint8,uint8,uint256,uint256)");

export interface Transfer {
  id: string;
  asset: Asset;
  amount: bigint;
  sender: Address;
  block: bigint;
  txHash: Hex;
  logIndex: number;
}

export interface Attribution {
  arrivals: Transfer[];
  unexplained: bigint;
  checkpoint: bigint;
}

/** The widest block range one read asks of the RPC: the public Arc node accepted 100,000 blocks and refused 200,000 when the fixtures were captured. */
export const MAX_LOG_SPAN = 100_000n;

/** About ten minutes of Arc blocks: a log newer than this may belong to a deposit the balance read has not seen yet. */
export const RACE_BLOCKS = 1_200n;

export const transfersRequest = (token: Address, vault: Address, from: bigint, to: bigint): RpcRequest => logsRangeRequest(token, from, to, [TRANSFER_TOPIC, null, topic(vault)]);

/** The vault's own events whose credits are not arrivals: a redemption or a conversion brings money in that nobody deposited. */
export const vaultMovesRequest = (vault: Address, from: bigint, to: bigint): RpcRequest => logsRangeRequest(vault, from, to, [[REDEEMED_TOPIC, SWAPPED_TOPIC]]);

export const arrivalId = (txHash: Hex, logIndex: number): string => keccak256(toBytes(`${txHash}:${logIndex}`)).slice(2, 12);

interface RawLog {
  address?: unknown;
  topics?: unknown;
  data?: unknown;
  transactionHash?: unknown;
  blockNumber?: unknown;
  logIndex?: unknown;
}

const isHex = (value: unknown): value is Hex => typeof value === "string" && /^0x[0-9a-fA-F]*$/.test(value);

export function decodeMoves(result: unknown): Set<string> {
  const hashes = new Set<string>();
  if (!Array.isArray(result)) return hashes;
  for (const log of result as RawLog[]) if (isHex(log.transactionHash)) hashes.add(log.transactionHash.toLowerCase());
  return hashes;
}

/** Only the token's own logs count: Arc also emits a system-level duplicate with 18 decimals, and a malformed entry is skipped rather than thrown on in the middle of a batch. */
export function decodeTransfers(result: unknown, token: Address, asset: Asset, exclude: ReadonlySet<string> = new Set()): Transfer[] {
  if (!Array.isArray(result)) return [];
  const transfers: Transfer[] = [];
  for (const log of result as RawLog[]) {
    if (typeof log.address !== "string" || log.address.toLowerCase() !== token.toLowerCase()) continue;
    if (!Array.isArray(log.topics) || log.topics.length !== 3 || !isHex(log.topics[1]) || !isHex(log.data) || log.data.length < 3) continue;
    if (!isHex(log.transactionHash) || !isHex(log.blockNumber) || !isHex(log.logIndex)) continue;
    if (exclude.has(log.transactionHash.toLowerCase())) continue;
    const logIndex = Number(hexToBigInt(log.logIndex));
    transfers.push({ id: arrivalId(log.transactionHash, logIndex), asset, amount: hexToBigInt(log.data), sender: `0x${log.topics[1].slice(26)}` as Address, block: hexToBigInt(log.blockNumber), txHash: log.transactionHash, logIndex });
  }
  return transfers.sort((a, b) => (a.block === b.block ? a.logIndex - b.logIndex : a.block < b.block ? -1 : 1));
}

/**
 * The vault's unallocated balance is explained by the transfers into it, oldest whole log first, as many as fit. What no log explains stays an unexplained remainder (income with a notice). When the logs add up to more than the balance, a fresh one means the balance read has not caught up (skip this run); an old excess means something other than an arrival moved money, so the whole balance becomes unexplained and the checkpoint advances: a vault is never stuck.
 */
export function attribute(input: { transfers: Transfer[]; unallocated: bigint; head: bigint }): Attribution | "race" {
  const total = input.transfers.reduce((sum, transfer) => sum + transfer.amount, 0n);
  if (total > input.unallocated) {
    const newest = input.transfers.reduce((block, transfer) => (transfer.block > block ? transfer.block : block), 0n);
    return input.head - newest <= RACE_BLOCKS ? "race" : { arrivals: [], unexplained: input.unallocated, checkpoint: input.head };
  }
  const arrivals: Transfer[] = [];
  let sum = 0n;
  for (const transfer of input.transfers) {
    if (sum + transfer.amount > input.unallocated) break;
    arrivals.push(transfer);
    sum += transfer.amount;
  }
  return { arrivals, unexplained: input.unallocated - sum, checkpoint: input.head };
}

const SENT_RETENTION_DAYS = 180;
const MAX_SENT = 12;

/** Money the vault paid out, remembered so that the same money coming back is recognised as not income: the newest twelve, none older than 180 days. */
export function appendSent(profile: Profile, entry: { payee: string; amount: bigint; date: PlainDate; kind: "o" | "p"; asset?: "U" | "E" }): Profile["flow"]["sent"] {
  const kept = profile.flow.sent.filter((old) => daysBetween(parsePlainDate(old[3]), entry.date) <= SENT_RETENTION_DAYS);
  return [...kept, [entry.payee, entry.asset ?? "U", entry.amount.toString(), formatPlainDate(entry.date), entry.kind] as Profile["flow"]["sent"][number]].slice(-MAX_SENT);
}
