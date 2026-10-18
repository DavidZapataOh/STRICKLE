import type { Action } from "@strickle/agent/signed";
import { type EarnVault, EARN_VAULTS } from "../config/earn.ts";

export const INVEST_BOXES = ["taxes", "payroll", "operating", "emergency", "profit"] as const;
export type InvestBox = (typeof INVEST_BOXES)[number];
export type EarnAction = Extract<Action, { kind: "invest" | "divest" }>;
export type EarnError = "amount" | "box" | "vault";

const MICRO = 1_000_000n;

/** Dollars as the person types them, with up to six decimals, in base units; zero is no request. */
function unitsOf(text: string): bigint | null {
  const match = /^([0-9]{1,9})(?:\.([0-9]{1,6}))?$/.exec(text.trim());
  if (!match) return null;
  const units = BigInt(match[1] ?? "0") * MICRO + BigInt((match[2] ?? "").padEnd(6, "0") || "0");
  return units > 0n ? units : null;
}

export function earnAction(input: { kind: "invest" | "divest"; box: string; vault: string; dollars: string }, offered: readonly EarnVault[] = EARN_VAULTS.testnet): { ok: true; action: EarnAction } | { ok: false; error: EarnError } {
  const box = INVEST_BOXES.find((candidate) => candidate === input.box);
  if (!box) return { ok: false, error: "box" };
  const vault = offered.find((candidate) => candidate.address.toLowerCase() === input.vault.toLowerCase());
  if (!vault) return { ok: false, error: "vault" };
  const units = unitsOf(input.dollars);
  if (units === null) return { ok: false, error: "amount" };
  return { ok: true, action: { kind: input.kind, box, vault: vault.address, amount: units.toString() } };
}
