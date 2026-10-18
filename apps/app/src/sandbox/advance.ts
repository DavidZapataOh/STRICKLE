import type { Action } from "@strickle/agent/signed";

export const FAUCET_URL = "https://faucet.circle.com";
export const ADVANCE_STEPS = [1, 7, 30] as const;
export type AdvanceStep = (typeof ADVANCE_STEPS)[number];

export const advanceChange = (days: AdvanceStep): Extract<Action, { kind: "advance" }> => ({ kind: "advance", days });

/** The sandbox exists only where the money is test money. */
export const sandboxEnabled = (network: "testnet" | "mainnet"): boolean => network !== "mainnet";
