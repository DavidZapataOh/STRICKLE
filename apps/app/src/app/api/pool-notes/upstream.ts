import { type Address, keccak256, toBytes } from "viem";
export const POOL_PAGE_SIZE = 1000;

export function buildPoolUpstream(pool: Address, apiKey: string | undefined, base: string, page = 1): string {
  const params = new URLSearchParams({ module: "logs", action: "getLogs", fromBlock: "0", toBlock: "latest", address: pool, topic0: keccak256(toBytes("NotesInserted(uint32,uint256,uint256,bytes)")), offset: String(POOL_PAGE_SIZE), page: String(page) });
  if (apiKey) params.set("apikey", apiKey);
  return `${base}?${params.toString()}`;
}
