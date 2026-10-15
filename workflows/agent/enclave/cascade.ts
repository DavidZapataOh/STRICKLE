// workflows/agent/enclave/cascade.ts
import { type Asset, type BoxKind, BOX_KINDS, allocatePayment, money } from "@strickle/core";
import type { Profile } from "./profile.ts";

export const BOX_ID = Object.fromEntries(BOX_KINDS.map((box, index) => [box, index + 1])) as Record<BoxKind, number>;
export const ASSET_ID: Record<Asset, number> = { USDC: 1, EURC: 2 };

export interface VaultBooks {
  asset: Asset;
  unallocated: bigint;
  operating: bigint;
  payrollFunded: bigint;
  emergency: bigint;
}

export function planSplit(profile: Profile, books: VaultBooks): { boxes: number[]; amounts: bigint[]; next: Profile } {
  const result = allocatePayment(money(books.asset, books.unallocated), {
    asset: books.asset,
    taxRateBps: profile.taxRateBps,
    taxBufferBps: profile.taxBufferBps,
    payrollDue: BigInt(profile.payrollDue),
    payrollFunded: books.payrollFunded,
    payrollShareBps: profile.payrollShareBps,
    dailySpend: BigInt(profile.dailySpend),
    operatingBalance: books.operating,
    floorDays: profile.floorDays,
    targetDays: profile.targetDays,
    salaryOwed: BigInt(profile.salaryOwed),
    emergencyTarget: BigInt(profile.emergencyTarget),
    emergencyBalance: books.emergency,
  });
  const boxes: number[] = [];
  const amounts: bigint[] = [];
  for (const kind of BOX_KINDS) {
    const amount = result.byBox[kind].units;
    if (amount > 0n) {
      boxes.push(BOX_ID[kind]);
      amounts.push(amount);
    }
  }
  return { boxes, amounts, next: { ...profile, salaryOwed: result.salaryPending.units.toString() } };
}
