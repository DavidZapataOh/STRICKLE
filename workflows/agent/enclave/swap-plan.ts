import { type Asset, type BoxKind, type PlainDate, type Rate, expectedOut, formatPlainDate, fromUsdc, toUsdc } from "@strickle/core";
import type { SwapConfig } from "../config.ts";
import { BOX_ID } from "./cascade.ts";
import type { Profile } from "./profile.ts";

export interface SwapIntent {
  box: number;
  boxKind: BoxKind;
  assetIn: Asset;
  amountIn: bigint;
  minOut: bigint;
  expected: bigint;
  reason: "to-euros" | "to-dollars";
}

export type SwapSkip = { skip: "halted" | "failures" | "daily-cap" | "nothing-to-do" };

/** Only the first four can be euros; taxes leave in local currency and the salary is paid in dollars, so euros that land in them (income paid in euros) are brought back, last. */
const ORDER = ["payroll", "operating", "emergency", "profit", "taxes", "salary"] as const;
export const MAX_FAILURES = 3;

/** At most one conversion per run. Amounts are counted in dollars for the daily cap and the minimum, so a euro box and a dollar box spend the same allowance. */
export function planSwap(input: { profile: Profile; raw: { usdc: Record<BoxKind, bigint>; eurc: Record<BoxKind, bigint> }; rate: Rate; today: PlainDate; config: SwapConfig }): SwapIntent | SwapSkip {
  const { profile, raw, rate, config } = input;
  if (profile.breaker.halted) return { skip: "halted" };
  if (profile.swap.failures >= MAX_FAILURES) return { skip: "failures" };
  const day = formatPlainDate(input.today);
  if (profile.swap.since === day) return { skip: "nothing-to-do" };

  const spentToday = profile.swap.day === day ? BigInt(profile.swap.spent) : 0n;
  const cap = BigInt(config.dailyCap);
  const minimum = BigInt(config.minUnits);
  let capped = false;

  for (const kind of ORDER) {
    const wantEuros = kind !== "taxes" && kind !== "salary" && profile.currencies[kind] === "EUR";
    const assetIn: Asset = wantEuros ? "USDC" : "EURC";
    const balance = (wantEuros ? raw.usdc : raw.eurc)[kind];
    if (toUsdc(assetIn, balance, rate) < minimum) continue;
    const left = cap > spentToday ? cap - spentToday : 0n;
    if (left === 0n) {
      capped = true;
      continue;
    }
    const allowance = fromUsdc(assetIn, left, rate);
    const amountIn = balance < allowance ? balance : allowance;
    if (toUsdc(assetIn, amountIn, rate) < minimum) {
      capped = true;
      continue;
    }
    const expected = expectedOut(assetIn, amountIn, rate);
    return { box: BOX_ID[kind], boxKind: kind, assetIn, amountIn, minOut: (expected * BigInt(10_000 - config.maxSlipBps)) / 10_000n, expected, reason: wantEuros ? "to-euros" : "to-dollars" };
  }
  return { skip: capped ? "daily-cap" : "nothing-to-do" };
}
