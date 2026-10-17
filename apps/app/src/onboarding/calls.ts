import { type Address, type Hex, encodeFunctionData } from "viem";
import { agentStateAbi, executorAbi, factoryAbi, vaultAbi } from "../chain/abi.ts";

export const SALARY_BOX = 3;
export const AGENT_WINDOW_SECONDS = 86_400;

/** One user operation: every call runs as the owner's smart account, in order, and either all succeed or none. */
export function onboardingCalls(args: { factory: Address; executor: Address; state: Address; vault: Address; owner: Address; capUnits: bigint; sealed: Hex; vaultExists: boolean; swapCalls?: { to: Address; data: Hex }[] }): { to: Address; data: Hex }[] {
  const calls: { to: Address; data: Hex }[] = [];
  if (!args.vaultExists) calls.push({ to: args.factory, data: encodeFunctionData({ abi: factoryAbi, functionName: "create", args: [args.owner] }) });
  calls.push(
    { to: args.vault, data: encodeFunctionData({ abi: vaultAbi, functionName: "approveRecipient", args: [SALARY_BOX, args.owner] }) },
    { to: args.vault, data: encodeFunctionData({ abi: vaultAbi, functionName: "setAgent", args: [args.executor, args.capUnits, AGENT_WINDOW_SECONDS] }) },
    { to: args.executor, data: encodeFunctionData({ abi: executorAbi, functionName: "register", args: [args.vault] }) },
    { to: args.state, data: encodeFunctionData({ abi: agentStateAbi, functionName: "submitProfile", args: [args.vault, args.sealed] }) },
  );
  // the adapter's one-day wait starts at creation, so conversions can begin a day after the account exists
  if (args.swapCalls) calls.push(...args.swapCalls);
  return calls;
}
