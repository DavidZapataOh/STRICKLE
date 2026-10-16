import { type Address, type Hex, encodeFunctionData } from "viem";
import type { BoxRule } from "../chain/vault.ts";
import { settingsWriteAbi } from "./abi.ts";

export type Call = { to: Address; data: Hex };

const MAX_UINT128 = 2n ** 128n - 1n;
const MAX_UINT32 = 2 ** 32 - 1;

const call = (to: Address, functionName: string, args?: readonly unknown[]): Call => ({ to, data: encodeFunctionData({ abi: settingsWriteAbi, functionName, args } as never) });

function checkBox(box: number): void {
  if (!Number.isInteger(box) || box < 1 || box > 6) throw new RangeError("a box is 1 to 6");
}

export const pauseCalls = (vault: Address): Call[] => [call(vault, "pauseAgent")];
export const resumeCalls = (vault: Address): Call[] => [call(vault, "resumeAgent")];

/** `setAgent` clears the pause flag, so a paused agent stays paused only if `pauseAgent` follows in the same batch. */
export function setAgentCalls(args: { vault: Address; agent: Address; cap: bigint; windowSeconds: number; paused: boolean }): Call[] {
  if (args.cap < 0n || args.cap > MAX_UINT128) throw new RangeError("the cap does not fit the vault");
  if (!Number.isInteger(args.windowSeconds) || args.windowSeconds < 0 || args.windowSeconds > MAX_UINT32) throw new RangeError("the window does not fit the vault");
  const calls = [call(args.vault, "setAgent", [args.agent, args.cap, args.windowSeconds])];
  return args.paused ? [...calls, ...pauseCalls(args.vault)] : calls;
}

export function setRuleCalls({ vault, box, rule }: { vault: Address; box: number; rule: BoxRule }): Call[] {
  checkBox(box);
  return [call(vault, "setRule", [box, { delay: rule.delaySeconds, alwaysDelayed: rule.alwaysDelayed, restricted: rule.restricted, floor: rule.floor, lockedUntil: BigInt(rule.lockedUntil) }])];
}

export function applyRuleCalls({ vault, box }: { vault: Address; box: number }): Call[] {
  checkBox(box);
  return [call(vault, "applyRuleChange", [box])];
}

export function cancelRuleCalls({ vault, box }: { vault: Address; box: number }): Call[] {
  checkBox(box);
  return [call(vault, "cancelRuleChange", [box])];
}

export function approveRecipientCalls({ vault, box, who }: { vault: Address; box: number; who: Address }): Call[] {
  checkBox(box);
  return [call(vault, "approveRecipient", [box, who])];
}

export function revokeRecipientCalls({ vault, box, who }: { vault: Address; box: number; who: Address }): Call[] {
  checkBox(box);
  return [call(vault, "revokeRecipient", [box, who])];
}
