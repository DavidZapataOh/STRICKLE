import type { BoxKind } from "@strickle/core";
import type { Address } from "viem";

export interface BoxRule {
  delaySeconds: number;
  alwaysDelayed: boolean;
  restricted: boolean;
  floor: bigint;
  lockedUntil: number;
}
export interface BoxState {
  kind: BoxKind;
  id: number;
  usdc: bigint;
  eurc: bigint;
  invested: bigint;
  rule: BoxRule;
}
/** What the vault says about conversions; a vault from before they existed has no such functions. */
export type Conversions = { supported: false } | { supported: true; adapter: Address; from: number; cap: bigint; window: number };

export interface VaultState {
  boxes: BoxState[];
  unallocatedUsdc: bigint;
  agent: Address;
  agentPaused: boolean;
  now: number;
  conversions: Conversions;
}

/** What a box holds in US dollars including the part working in a vault; the money is the user's either way. */
export const boxTotal = (box: BoxState): bigint => box.usdc + box.invested;

export const heldTotals = (vault: VaultState): { usdc: bigint; eurc: bigint } => ({
  usdc: vault.boxes.reduce((sum, box) => sum + boxTotal(box), 0n),
  eurc: vault.boxes.reduce((sum, box) => sum + box.eurc, 0n),
});
