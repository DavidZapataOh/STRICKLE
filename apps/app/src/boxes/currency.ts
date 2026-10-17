import { type Address, type Hex, encodeFunctionData, parseAbi, zeroAddress } from "viem";
import { SWAP_DAILY_CAP, SWAP_WINDOW_SECONDS } from "../config/swap.ts";
import type { VaultState } from "../chain/totals.ts";

const abi = parseAbi(["function approveSwapAdapter(address adapter)", "function setSwapCap(uint128 cap, uint32 window)"]);

type Call = { to: Address; data: Hex };

/** The two owner calls that let a vault convert: approve Circle's adapter (it takes effect a day later) and give conversions their own daily cap. */
export const swapSetupCalls = (vault: Address, adapter: Address): Call[] => [
  { to: vault, data: encodeFunctionData({ abi, functionName: "approveSwapAdapter", args: [adapter] }) },
  { to: vault, data: encodeFunctionData({ abi, functionName: "setSwapCap", args: [SWAP_DAILY_CAP, SWAP_WINDOW_SECONDS] }) },
];

/** What each box holds in dollars (the part working in a yield vault counted) and in euros. */
export const boxHoldings = (vault: VaultState): { box: VaultState["boxes"][number]["kind"]; usdc: bigint; eurc: bigint }[] =>
  vault.boxes.map((box) => ({ box: box.kind, usdc: box.usdc + box.invested, eurc: box.eurc }));

export type HeldReason = "worse-than-reference" | "better-than-reference" | "stale-feed" | "adapter-not-approved" | "failures" | "daily-cap" | "invalid-quote" | "quote-unavailable" | "vault-refused";

export type ConversionStatus =
  | { kind: "unavailable" }
  | { kind: "not-allowed" }
  | { kind: "pending"; from: number }
  | { kind: "active"; cap: bigint }
  | { kind: "paused"; reason: HeldReason; cap: bigint };

/** Read from the chain, never assumed: a vault created before conversions existed answers none of these calls. */
export function conversionStatus(vault: VaultState, expectedAdapter: Address, held?: HeldReason): ConversionStatus {
  const state = vault.conversions;
  if (!state.supported) return { kind: "unavailable" };
  if (state.adapter === zeroAddress || state.cap === 0n) return { kind: "not-allowed" };
  if (state.adapter.toLowerCase() !== expectedAdapter.toLowerCase()) return { kind: "unavailable" };
  if (vault.now < state.from) return { kind: "pending", from: state.from };
  return held ? { kind: "paused", reason: held, cap: state.cap } : { kind: "active", cap: state.cap };
}
