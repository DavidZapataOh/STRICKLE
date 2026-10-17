import type { CashEntry } from "@strickle/brain";
import { type PlainDate, daysBetween, parsePlainDate, toEpochDay } from "@strickle/core";
import type { Address } from "viem";
import type { Profile } from "./profile.ts";

export const ESTIMATE_SOURCE = "estimate";

export const seedOf = (vault: Address, today: PlainDate): number => (Number.parseInt(vault.slice(2, 10), 16) ^ toEpochDay(today)) >>> 0;

/** Money the user moved or got back is not income: it never reaches the forecast or the weeks of history. */
const NOT_INCOME_SOURCES = new Set(["transfer", "refund"]);

export const historyOf = (profile: Profile): CashEntry[] =>
  profile.history.filter(([, , source]) => !NOT_INCOME_SOURCES.has(source)).map(([date, amount, source]) => ({ date: parsePlainDate(date), amount: BigInt(amount), source }));

/** Whole weeks covered by income that really arrived: the user's onboarding estimate shapes the forecast but never counts as history. */
export function historyWeeksOf(history: readonly CashEntry[], today: PlainDate): number {
  const oldest = history
    .filter((entry) => entry.source !== ESTIMATE_SOURCE)
    .reduce<PlainDate | undefined>((first, entry) => (first === undefined || daysBetween(entry.date, first) > 0 ? entry.date : first), undefined);
  return oldest === undefined ? 0 : Math.floor(daysBetween(oldest, today) / 7);
}

export const isObserved = (history: readonly CashEntry[]): boolean => history.some((entry) => entry.source !== ESTIMATE_SOURCE);
