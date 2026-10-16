import { type Address, keccak256, pad, toBytes } from "viem";
import type { Deployments } from "../../../config/network.ts";
import type { LogKind } from "../../../chain/logs.ts";

const SIGNATURE = {
  notice: "Notice(address,uint64,bytes)",
  allocated: "Allocated(uint8,uint8,uint256,uint256)",
  split: "Split(address,uint8,uint256)",
  salary: "SalaryPaid(address,uint8,address,uint256)",
  "private-spend": "PrivateSpend(address,uint256)",
} as const;

export const PAGE_SIZE = 1_000;

/** The explorer's log query: ascending by block, so the newest entries are on the last page. */
export function buildUpstream(kind: LogKind, vault: Address, deployments: Pick<Deployments, "AgentState" | "AgentExecutor">, options: { base: string; fromBlock: number; page: number; apiKey?: string }): string {
  const address = kind === "notice" ? deployments.AgentState : kind === "allocated" ? vault : deployments.AgentExecutor;
  const params = new URLSearchParams({
    module: "logs", action: "getLogs", fromBlock: String(options.fromBlock), toBlock: "latest", address,
    topic0: keccak256(toBytes(SIGNATURE[kind])), offset: String(PAGE_SIZE), page: String(options.page),
  });
  if (kind !== "allocated") {
    params.set("topic0_1_opr", "and");
    params.set("topic1", pad(vault.toLowerCase() as Address, { size: 32 }));
  }
  if (options.apiKey) params.set("apikey", options.apiKey);
  return `${options.base}?${params.toString()}`;
}

/** Blockscout's hosted API honours the key and has no per-address ceiling; the explorer's own endpoint is anonymous and allows about ten requests per window. */
export const explorerApiFor = (chainId: number, explorerUrl: string, apiKey?: string): string => (apiKey ? `https://api.blockscout.com/${chainId}/api/` : `${explorerUrl}/api`);
