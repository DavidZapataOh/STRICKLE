import type { Address, PublicClient } from "viem";
import type { BoxRule } from "../chain/vault.ts";
import { settingsReadAbi } from "./abi.ts";

export type AgentLimits = { agent: Address; paused: boolean; cap: bigint; windowSeconds: number };
export type PendingRule = { box: number; rule: BoxRule; effectiveAt: number };
export type Approval = { effectiveAt: number } | null;
export type SettingsChain = { limits: AgentLimits; pending: (PendingRule | null)[]; approvals: Record<string, Approval> };

type RawRule = { delay: number; alwaysDelayed: boolean; restricted: boolean; floor: bigint; lockedUntil: bigint };

export const ruleFromRaw = (raw: RawRule): BoxRule => ({
  delaySeconds: raw.delay,
  alwaysDelayed: raw.alwaysDelayed,
  restricted: raw.restricted,
  floor: raw.floor,
  lockedUntil: Number(raw.lockedUntil),
});

export function pendingFrom(box: number, raw: readonly [RawRule, bigint, boolean]): PendingRule | null {
  const [rule, effectiveAt, open] = raw;
  return open ? { box, rule: ruleFromRaw(rule), effectiveAt: Number(effectiveAt) } : null;
}

export const approvalFrom = (effectiveAt: bigint): Approval => (effectiveAt === 0n ? null : { effectiveAt: Number(effectiveAt) });

export function approvalState(approval: Approval, now: number): "none" | "waiting" | "effective" {
  if (!approval) return "none";
  return now >= approval.effectiveAt ? "effective" : "waiting";
}

export const approvalKey = (box: number, who: Address): string => `${box}:${who.toLowerCase()}`;

const BOXES = [1, 2, 3, 4, 5, 6] as const;

export async function readSettingsChain(client: PublicClient, vault: Address, payees: readonly { box: number; who: Address }[] = []): Promise<SettingsChain> {
  const read = <T>(functionName: string, args?: readonly unknown[]) => client.readContract({ address: vault, abi: settingsReadAbi, functionName, args } as never) as Promise<T>;
  const [agent, paused, cap, window, changes, approved] = await Promise.all([
    read<Address>("agent"),
    read<boolean>("agentPaused"),
    read<bigint>("agentCap"),
    read<number>("agentWindow"),
    Promise.all(BOXES.map((box) => read<readonly [RawRule, bigint, boolean]>("ruleChanges", [box]))),
    Promise.all(payees.map(({ box, who }) => read<bigint>("approvedFrom", [box, who]))),
  ]);
  return {
    limits: { agent, paused, cap, windowSeconds: Number(window) },
    pending: changes.map((raw, index) => pendingFrom(BOXES[index] as number, raw)),
    approvals: Object.fromEntries(payees.map(({ box, who }, index) => [approvalKey(box, who), approvalFrom(approved[index] as bigint)])),
  };
}
