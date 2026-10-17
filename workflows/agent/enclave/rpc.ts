// workflows/agent/enclave/rpc.ts
import { type Address, type Hex, decodeFunctionResult, encodeFunctionData, numberToHex, pad, parseAbi } from "viem";

export interface RpcRequest {
  method: string;
  params: unknown[];
}

export const stateAbi = parseAbi(["function head(address vault) view returns (uint64 version, uint64 updatedAt, uint64 applied)"]);

const ownerAbi = parseAbi(["function owner() view returns (address)"]);
const factoryAbi = parseAbi(["function vaultOf(address owner) view returns (address)"]);

const blockTag = (block: bigint | "latest") => (block === "latest" ? block : numberToHex(block));

export const topic = (value: Address | bigint): Hex => pad(typeof value === "bigint" ? numberToHex(value) : value, { size: 32 });

export const callRequest = (to: Address, data: Hex, block: bigint | "latest"): RpcRequest => ({
  method: "eth_call",
  params: [{ to, data }, blockTag(block)],
});

export const logsRequest = (address: Address, block: bigint, topics: Hex[]): RpcRequest => ({
  method: "eth_getLogs",
  params: [{ address, fromBlock: blockTag(block), toBlock: blockTag(block), topics }],
});

export const blockNumberRequest = (): RpcRequest => ({ method: "eth_blockNumber", params: [] });

/** A block range, for reading what arrived since a checkpoint; a topic may be a list of alternatives. */
export const logsRangeRequest = (address: Address | undefined, from: bigint, to: bigint, topics: (Hex | Hex[] | null)[]): RpcRequest => ({
  method: "eth_getLogs",
  params: [{ ...(address === undefined ? {} : { address }), fromBlock: blockTag(from), toBlock: blockTag(to), topics }],
});

export const ownerRequest = (vault: Address): RpcRequest => callRequest(vault, encodeFunctionData({ abi: ownerAbi, functionName: "owner" }), "latest");
export const decodeOwner = (result: unknown): Address => decodeFunctionResult({ abi: ownerAbi, functionName: "owner", data: result as Hex });
export const vaultOfRequest = (factory: Address, owner: Address): RpcRequest => callRequest(factory, encodeFunctionData({ abi: factoryAbi, functionName: "vaultOf", args: [owner] }), "latest");
export const decodeVaultOf = (result: unknown): Address => decodeFunctionResult({ abi: factoryAbi, functionName: "vaultOf", data: result as Hex });

// One HTTP request carries at most this many JSON-RPC calls: the RPC provider's own batch limit is not documented, so stay well below the 120 KB request cap.
export const MAX_BATCH = 100;

export function batchBody(requests: readonly RpcRequest[]): string {
  if (requests.length > MAX_BATCH) throw new Error("batch too large");
  const body = requests.map((request, index) => ({ jsonrpc: "2.0", id: index + 1, ...request }));
  return Buffer.from(JSON.stringify(body)).toString("base64");
}

export function parseBatch(text: string, expected: number): unknown[] {
  try {
    const responses = JSON.parse(text) as { id: number; result?: unknown; error?: unknown }[];
    if (!Array.isArray(responses)) throw new Error();
    return Array.from({ length: expected }, (_, index) => {
      const response = responses.find((candidate) => candidate.id === index + 1);
      if (!response || response.error !== undefined || response.result === undefined) throw new Error();
      return response.result;
    });
  } catch {
    throw new Error("rpc error");
  }
}

export function firstLogData(result: unknown): Hex {
  const first = Array.isArray(result) ? (result[0] as { data?: Hex } | undefined) : undefined;
  if (!first || typeof first.data !== "string") throw new Error("no log");
  return first.data;
}

export const codeRequest = (address: Address): RpcRequest => ({ method: "eth_getCode", params: [address, "latest"] });
export const isContract = (result: unknown): boolean => typeof result === "string" && result !== "0x" && result.length > 2;
