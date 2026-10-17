import { type Address, type Hex, encodeFunctionData, parseAbi } from "viem";
import type { EarnNeed } from "./status.ts";

const abi = parseAbi(["function approveVault(address vault)", "function approveSwapAdapter(address adapter)"]);

type Call = { to: Address; data: Hex };

/** The owner calls that let a vault put a box to work: Circle's adapter first when it was never approved, then the yield vault. Each takes effect a day later. */
export function earnSetupCalls(input: { vault: Address; adapter: Address; earnVault: Address; needs: readonly EarnNeed[] }): Call[] {
  const calls: Call[] = [];
  if (input.needs.includes("adapter")) calls.push({ to: input.vault, data: encodeFunctionData({ abi, functionName: "approveSwapAdapter", args: [input.adapter] }) });
  if (input.needs.includes("vault")) calls.push({ to: input.vault, data: encodeFunctionData({ abi, functionName: "approveVault", args: [input.earnVault] }) });
  return calls;
}
