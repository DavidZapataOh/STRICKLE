import { type Address, zeroAddress } from "viem";
import type { Conversions, EarnState } from "../chain/totals.ts";

export type EarnNeed = "adapter" | "vault";
export type EarnStatus = { kind: "unavailable" } | { kind: "unreadable" } | { kind: "not-allowed"; needs: EarnNeed[] } | { kind: "pending"; from: number } | { kind: "active" };

/** Read from the chain, never assumed: an account from before yield existed answers none of these calls, and the adapter and the vault each wait a day after the owner approves them. */
export function earnStatus(input: { earn?: EarnState; conversions: Conversions; expectedAdapter: Address; vault: Address; now: number }): EarnStatus {
  const { earn, conversions } = input;
  if (earn && !earn.supported && earn.reason === "unreadable") return { kind: "unreadable" };
  if (!earn?.supported || !conversions.supported) return { kind: "unavailable" };
  const row = earn.vaults.find((entry) => entry.vault.toLowerCase() === input.vault.toLowerCase());
  if (!row) return { kind: "unavailable" };
  const adapterSet = conversions.adapter !== zeroAddress;
  if (adapterSet && conversions.adapter.toLowerCase() !== input.expectedAdapter.toLowerCase()) return { kind: "unavailable" };
  const needs: EarnNeed[] = [...(adapterSet ? [] : (["adapter"] as const)), ...(row.approvedFrom === 0 ? (["vault"] as const) : [])];
  if (needs.length > 0) return { kind: "not-allowed", needs };
  const from = Math.max(conversions.from, row.approvedFrom);
  return input.now < from ? { kind: "pending", from } : { kind: "active" };
}
