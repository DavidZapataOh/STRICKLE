import { plainDate } from "@strickle/core";
import type { Snapshot } from "../src/invariants.ts";

export const asOf = plainDate(2026, 10, 15);
export const zeroBoxes = { taxes: 0n, payroll: 0n, salary: 0n, operating: 0n, emergency: 0n, profit: 0n };

/** Balanced: 400 + 300 + 200 + 200 + 100 + 50 = 1,250 = liquid. Floor = 14 x 10 = 140. */
export const snap = (over: Partial<Snapshot> = {}): Snapshot => ({
  asOf,
  boxes: { ...zeroBoxes, taxes: 400n, payroll: 300n, salary: 200n, operating: 200n, emergency: 100n, profit: 50n },
  unallocated: 0n,
  liquid: 1_250n,
  inVaults: 0n,
  taxesReserved: 400n,
  payrolls: [],
  dailySpend: 10n,
  outflowsToday: 0n,
  ...over,
});
