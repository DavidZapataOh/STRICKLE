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

/** One yield vault as the account sees it: when its approval takes effect (zero when never approved), and what each investable box holds in it as shares and as dollars. */
export interface EarnPosition {
  vault: Address;
  approvedFrom: number;
  shares: Partial<Record<BoxKind, bigint>>;
  value: Partial<Record<BoxKind, bigint>>;
}
/** What the account says about putting boxes to work; a vault from before it existed has no such function. */
export type EarnState =
  | { supported: false; reason: "old" | "unreadable" }
  | { supported: true; vaults: EarnPosition[]; maxInvestBps: Partial<Record<BoxKind, number>>; invested: Partial<Record<BoxKind, bigint>> };

export interface VaultState {
  boxes: BoxState[];
  unallocatedUsdc: bigint;
  agent: Address;
  agentPaused: boolean;
  now: number;
  conversions: Conversions;
  earn?: EarnState;
}

/** What a box holds in US dollars including the part working in a vault; the money is the user's either way. */
export const boxTotal = (box: BoxState): bigint => box.usdc + box.invested;

export const heldTotals = (vault: VaultState): { usdc: bigint; eurc: bigint } => ({
  usdc: vault.boxes.reduce((sum, box) => sum + boxTotal(box), 0n),
  eurc: vault.boxes.reduce((sum, box) => sum + box.eurc, 0n),
});
