// workflows/agent/enclave/books.ts
import { type Address, type Hex, decodeAbiParameters, decodeFunctionResult, encodeFunctionData, hexToBytes, keccak256, parseAbi, toBytes } from "viem";
import { BOX_KINDS, type BoxKind, type Rate, toUsdc } from "@strickle/core";
import { BOX_ID } from "./cascade.ts";
import { type RpcRequest, callRequest, firstLogData, logsRequest, stateAbi, topic } from "./rpc.ts";
import type { TickBooks } from "./tick.ts";

export interface PendingItem {
  vault: Address;
  asset: number;
  amount: bigint;
}

const executorAbi = parseAbi(["function pending(uint256 seed, uint256 maxHits) view returns ((address vault, uint8 asset, uint256 amount)[])"]);
const vaultAbi = parseAbi(["function boxBalance(uint8 asset, uint8 box) view returns (uint256)"]);
const STATE_UPDATED = keccak256(toBytes("StateUpdated(address,uint64,bytes)"));

export const pendingRequest = (executor: Address, seed: number, maxHits: number): RpcRequest =>
  callRequest(executor, encodeFunctionData({ abi: executorAbi, functionName: "pending", args: [BigInt(seed), BigInt(maxHits)] }), "latest");

/** The first entry of each vault: a vault holding both assets would otherwise get two reports built on the same state version. */
export const onePerVault = (items: PendingItem[]): PendingItem[] => items.filter((item, index) => items.findIndex((other) => other.vault === item.vault) === index);

export const decodePending = (result: unknown): PendingItem[] =>
  decodeFunctionResult({ abi: executorAbi, functionName: "pending", data: result as Hex }).map((item) => ({ vault: item.vault, asset: item.asset, amount: item.amount }));

const COUNTED_BOXES = [BOX_ID.operating, BOX_ID.payroll, BOX_ID.emergency] as const;

/** The head and the three balances the cascade reads; with `both`, the same three in the other asset follow, so euro and dollar holdings can be valued together. */
export const booksRequests = (state: Address, vault: Address, asset: number, both = false): RpcRequest[] => [
  callRequest(state, encodeFunctionData({ abi: stateAbi, functionName: "head", args: [vault] }), "latest"),
  ...(both ? [asset, asset === 1 ? 2 : 1] : [asset]).flatMap((id) =>
    COUNTED_BOXES.map((box) => callRequest(vault, encodeFunctionData({ abi: vaultAbi, functionName: "boxBalance", args: [id, box] }), "latest")),
  ),
];

export function decodeBooks(answers: unknown[]) {
  const [version, at, applied] = decodeFunctionResult({ abi: stateAbi, functionName: "head", data: answers[0] as Hex });
  const balance = (answer: unknown) => decodeFunctionResult({ abi: vaultAbi, functionName: "boxBalance", data: answer as Hex });
  const other = answers.length >= 7 ? { operating: balance(answers[4]), payrollFunded: balance(answers[5]), emergency: balance(answers[6]) } : undefined;
  return { version, at, applied, operating: balance(answers[1]), payrollFunded: balance(answers[2]), emergency: balance(answers[3]), other };
}

/** The own-asset balances plus the other asset's, valued at the feed rate; without a rate the other asset is left out, the conservative reading. */
export function valuedBooks(asset: "USDC" | "EURC", own: { operating: bigint; payrollFunded: bigint; emergency: bigint }, other: { operating: bigint; payrollFunded: bigint; emergency: bigint } | undefined, rate: Rate | undefined) {
  if (!other || !rate) return own;
  const otherAsset = asset === "USDC" ? "EURC" : "USDC";
  const convert = (units: bigint) => (otherAsset === "EURC" ? toUsdc("EURC", units, rate) : (units * rate.usdcUsd) / rate.eurcUsd);
  return { operating: own.operating + convert(other.operating), payrollFunded: own.payrollFunded + convert(other.payrollFunded), emergency: own.emergency + convert(other.emergency) };
}

export const stateLogRequest = (state: Address, vault: Address, version: bigint, at: bigint): RpcRequest =>
  logsRequest(state, at, [STATE_UPDATED, topic(vault), topic(version)]);

export const decodeStateLog = (result: unknown): Uint8Array => hexToBytes(decodeAbiParameters([{ type: "bytes" }], firstLogData(result))[0]);

const tickVaultAbi = parseAbi([
  "function boxBalance(uint8 asset, uint8 box) view returns (uint256)",
  "function swapAdapter() view returns (address)",
  "function swapAdapterFrom() view returns (uint64)",
  "function swapSlippageBps() view returns (uint16)",
  "function invested(uint8 asset, uint8 box) view returns (uint256)",
  "function unallocated(uint8 asset) view returns (uint256)",
]);
const delegatedAbi = parseAbi(["function delegated(uint256 seed, uint256 maxHits) view returns (address[])"]);
const USDC = 1;
const BOXES = [1, 2, 3, 4, 5, 6] as const;

export const delegatedRequest = (executor: Address, seed: number, maxHits: number): RpcRequest =>
  callRequest(executor, encodeFunctionData({ abi: delegatedAbi, functionName: "delegated", args: [BigInt(seed), BigInt(maxHits)] }), "latest");

export const headRequest = (state: Address, vault: Address): RpcRequest =>
  callRequest(state, encodeFunctionData({ abi: stateAbi, functionName: "head", args: [vault] }), "latest");

export const decodeHead = (answer: unknown): { version: bigint; at: bigint; applied: bigint } => {
  const [version, at, applied] = decodeFunctionResult({ abi: stateAbi, functionName: "head", data: answer as Hex });
  return { version, at, applied };
};

export const decodeDelegated = (result: unknown): Address[] => [...decodeFunctionResult({ abi: delegatedAbi, functionName: "delegated", data: result as Hex })];

const noticeAbi = parseAbi(["function noticeCount(address vault) view returns (uint64)"]);
export const noticeCountRequest = (state: Address, vault: Address): RpcRequest =>
  callRequest(state, encodeFunctionData({ abi: noticeAbi, functionName: "noticeCount", args: [vault] }), "latest");
export const decodeNoticeCount = (result: unknown): bigint => decodeFunctionResult({ abi: noticeAbi, functionName: "noticeCount", data: result as Hex });

export const tickRequests = (state: Address, vault: Address): RpcRequest[] => [
  callRequest(state, encodeFunctionData({ abi: stateAbi, functionName: "head", args: [vault] }), "latest"),
  ...BOXES.map((box) => callRequest(vault, encodeFunctionData({ abi: tickVaultAbi, functionName: "boxBalance", args: [USDC, box] }), "latest")),
  ...BOXES.map((box) => callRequest(vault, encodeFunctionData({ abi: tickVaultAbi, functionName: "invested", args: [USDC, box] }), "latest")),
  callRequest(vault, encodeFunctionData({ abi: tickVaultAbi, functionName: "unallocated", args: [USDC] }), "latest"),
  noticeCountRequest(state, vault),
];

export const SWAP_READS_PER_VAULT = 9;

/** What a conversion needs from one vault, in a batch of its own so a vault that cannot answer never stops a tick: the six euro balances, the approved adapter and the vault's own slippage setting. */
export const swapReads = (vault: Address): RpcRequest[] => [
  ...BOXES.map((box) => callRequest(vault, encodeFunctionData({ abi: tickVaultAbi, functionName: "boxBalance", args: [2, box] }), "latest")),
  callRequest(vault, encodeFunctionData({ abi: tickVaultAbi, functionName: "swapAdapter" }), "latest"),
  callRequest(vault, encodeFunctionData({ abi: tickVaultAbi, functionName: "swapAdapterFrom" }), "latest"),
  callRequest(vault, encodeFunctionData({ abi: tickVaultAbi, functionName: "swapSlippageBps" }), "latest"),
];

export interface SwapReadout {
  raw: { usdc: Record<BoxKind, bigint>; eurc: Record<BoxKind, bigint> };
  rate: Rate | "stale";
  adapter: { address: Address; from: bigint };
  /** The slippage the vault itself enforces; the agent never asks for a looser minimum than the vault would accept. */
  slippageBps: number;
}

export function decodeTickBooks(answers: unknown[]): { version: bigint; at: bigint; applied: bigint; notices: bigint; books: TickBooks } {
  const [version, at, applied] = decodeFunctionResult({ abi: stateAbi, functionName: "head", data: answers[0] as Hex });
  const word = (answer: unknown) => decodeFunctionResult({ abi: tickVaultAbi, functionName: "boxBalance", data: answer as Hex });
  const byKind = (offset: number) => Object.fromEntries(BOX_KINDS.map((kind, index) => [kind, word(answers[offset + index])])) as TickBooks["boxes"];
  return { version, at, applied, notices: decodeNoticeCount(answers[14]), books: { boxes: byKind(1), invested: byKind(7), unallocated: word(answers[13]) } };
}

/** The euro side of one vault. A vault from before conversions answers none of these calls, which the caller treats as "no conversions here". */
export function decodeSwapReadout(usdc: TickBooks["boxes"], answers: unknown[], rate: Rate | "stale"): SwapReadout {
  const word = (answer: unknown) => decodeFunctionResult({ abi: tickVaultAbi, functionName: "boxBalance", data: answer as Hex });
  const eurc = Object.fromEntries(BOX_KINDS.map((kind, index) => [kind, word(answers[index])])) as TickBooks["boxes"];
  return {
    raw: { usdc, eurc },
    rate,
    adapter: { address: decodeFunctionResult({ abi: tickVaultAbi, functionName: "swapAdapter", data: answers[6] as Hex }), from: decodeFunctionResult({ abi: tickVaultAbi, functionName: "swapAdapterFrom", data: answers[7] as Hex }) },
    slippageBps: decodeFunctionResult({ abi: tickVaultAbi, functionName: "swapSlippageBps", data: answers[8] as Hex }),
  };
}

/** The books in dollars: each box's dollars plus its euros at the rate; with no usable rate the euros are left out, the conservative reading. */
export function valueTickBooks(books: TickBooks, readout: SwapReadout, rate: Rate | undefined): TickBooks {
  if (!rate) return books;
  const boxes = Object.fromEntries(BOX_KINDS.map((kind) => [kind, readout.raw.usdc[kind] + toUsdc("EURC", readout.raw.eurc[kind], rate)])) as TickBooks["boxes"];
  return { ...books, boxes };
}
