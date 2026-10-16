// workflows/agent/enclave/books.ts
import { type Address, type Hex, decodeAbiParameters, decodeFunctionResult, encodeFunctionData, hexToBytes, keccak256, parseAbi, toBytes } from "viem";
import { BOX_KINDS } from "@strickle/core";
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

export const booksRequests = (state: Address, vault: Address, asset: number): RpcRequest[] => [
  callRequest(state, encodeFunctionData({ abi: stateAbi, functionName: "head", args: [vault] }), "latest"),
  ...[BOX_ID.operating, BOX_ID.payroll, BOX_ID.emergency].map((box) =>
    callRequest(vault, encodeFunctionData({ abi: vaultAbi, functionName: "boxBalance", args: [asset, box] }), "latest"),
  ),
];

export function decodeBooks(answers: unknown[]) {
  const [version, at, applied] = decodeFunctionResult({ abi: stateAbi, functionName: "head", data: answers[0] as Hex });
  const balance = (answer: unknown) => decodeFunctionResult({ abi: vaultAbi, functionName: "boxBalance", data: answer as Hex });
  return { version, at, applied, operating: balance(answers[1]), payrollFunded: balance(answers[2]), emergency: balance(answers[3]) };
}

export const stateLogRequest = (state: Address, vault: Address, version: bigint, at: bigint): RpcRequest =>
  logsRequest(state, at, [STATE_UPDATED, topic(vault), topic(version)]);

export const decodeStateLog = (result: unknown): Uint8Array => hexToBytes(decodeAbiParameters([{ type: "bytes" }], firstLogData(result))[0]);

const tickVaultAbi = parseAbi([
  "function boxBalance(uint8 asset, uint8 box) view returns (uint256)",
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

export const tickRequests = (state: Address, vault: Address): RpcRequest[] => [
  callRequest(state, encodeFunctionData({ abi: stateAbi, functionName: "head", args: [vault] }), "latest"),
  ...BOXES.map((box) => callRequest(vault, encodeFunctionData({ abi: tickVaultAbi, functionName: "boxBalance", args: [USDC, box] }), "latest")),
  ...BOXES.map((box) => callRequest(vault, encodeFunctionData({ abi: tickVaultAbi, functionName: "invested", args: [USDC, box] }), "latest")),
  callRequest(vault, encodeFunctionData({ abi: tickVaultAbi, functionName: "unallocated", args: [USDC] }), "latest"),
];

export function decodeTickBooks(answers: unknown[]): { version: bigint; at: bigint; applied: bigint; books: TickBooks } {
  const [version, at, applied] = decodeFunctionResult({ abi: stateAbi, functionName: "head", data: answers[0] as Hex });
  const word = (answer: unknown) => decodeFunctionResult({ abi: tickVaultAbi, functionName: "boxBalance", data: answer as Hex });
  const byKind = (offset: number) => Object.fromEntries(BOX_KINDS.map((kind, index) => [kind, word(answers[offset + index])])) as TickBooks["boxes"];
  return { version, at, applied, books: { boxes: byKind(1), invested: byKind(7), unallocated: word(answers[13]) } };
}
