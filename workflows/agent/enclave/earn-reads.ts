import { type Address, decodeFunctionResult, encodeFunctionData, parseAbi } from "viem";
import type { EarnReads } from "./earn-handle.ts";
import { type RpcRequest, callRequest } from "./rpc.ts";

const vaultAbi = parseAbi([
  "function vaultApprovedFrom(address vault) view returns (uint64)",
  "function sharesOf(address vault, uint8 box) view returns (uint256)",
  "function boxBalance(uint8 asset, uint8 box) view returns (uint256)",
  "function swapAdapter() view returns (address)",
  "function swapAdapterFrom() view returns (uint64)",
  "function swapSlippageBps() view returns (uint16)",
]);
const yieldAbi = parseAbi(["function previewDeposit(uint256 assets) view returns (uint256)", "function previewRedeem(uint256 shares) view returns (uint256)"]);
const USDC = 1;

export const EARN_FIRST_READS = 6;

/** The first batch for one request: what the box vault says about the approvals, the box's money and its shares. */
export const earnFirstReads = (vault: Address, earnVault: Address, box: number): RpcRequest[] => [
  callRequest(vault, encodeFunctionData({ abi: vaultAbi, functionName: "vaultApprovedFrom", args: [earnVault] }), "latest"),
  callRequest(vault, encodeFunctionData({ abi: vaultAbi, functionName: "sharesOf", args: [earnVault, box] }), "latest"),
  callRequest(vault, encodeFunctionData({ abi: vaultAbi, functionName: "boxBalance", args: [USDC, box] }), "latest"),
  callRequest(vault, encodeFunctionData({ abi: vaultAbi, functionName: "swapAdapter" }), "latest"),
  callRequest(vault, encodeFunctionData({ abi: vaultAbi, functionName: "swapAdapterFrom" }), "latest"),
  callRequest(vault, encodeFunctionData({ abi: vaultAbi, functionName: "swapSlippageBps" }), "latest"),
];

type First = Omit<EarnReads, "previewShares" | "position">;

export function decodeEarnFirst(answers: unknown[]): First {
  const data = (index: number) => answers[index] as `0x${string}`;
  return {
    approvedFrom: decodeFunctionResult({ abi: vaultAbi, functionName: "vaultApprovedFrom", data: data(0) }),
    owned: decodeFunctionResult({ abi: vaultAbi, functionName: "sharesOf", data: data(1) }),
    box: decodeFunctionResult({ abi: vaultAbi, functionName: "boxBalance", data: data(2) }),
    adapter: { address: decodeFunctionResult({ abi: vaultAbi, functionName: "swapAdapter", data: data(3) }), from: decodeFunctionResult({ abi: vaultAbi, functionName: "swapAdapterFrom", data: data(4) }) },
    slippageBps: decodeFunctionResult({ abi: vaultAbi, functionName: "swapSlippageBps", data: data(5) }),
  };
}

/** The second batch asks the yield vault itself: what a deposit of the amount would get, or what all the box's shares are worth. */
export const earnPreviewRead = (earnVault: Address, deposit: boolean, amount: bigint, owned: bigint): RpcRequest =>
  callRequest(earnVault, encodeFunctionData({ abi: yieldAbi, ...(deposit ? { functionName: "previewDeposit", args: [amount] } : { functionName: "previewRedeem", args: [owned] }) }), "latest");

export function decodeEarnPreview(answer: unknown, deposit: boolean): bigint {
  return decodeFunctionResult({ abi: yieldAbi, functionName: deposit ? "previewDeposit" : "previewRedeem", data: answer as `0x${string}` });
}
