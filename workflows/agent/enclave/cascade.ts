// workflows/agent/enclave/cascade.ts
import { type Asset, type BoxKind, BOX_KINDS, type PlainDate, type Rate, allocatePayment, daysBetween, formatPlainDate, fromUsdc, money, parsePlainDate } from "@strickle/core";
import type { Profile } from "./profile.ts";

export const BOX_ID = Object.fromEntries(BOX_KINDS.map((box, index) => [box, index + 1])) as Record<BoxKind, number>;
export const ASSET_ID: Record<Asset, number> = { USDC: 1, EURC: 2 };

const WINDOW_DAYS = 91;
const MAX_HISTORY = 200;

export interface VaultBooks {
  asset: Asset;
  unallocated: bigint;
  operating: bigint;
  payrollFunded: bigint;
  emergency: bigint;
}

/** The cascade for one amount. Income reserves taxes (plus a catch-up if one is owed); money that is not income reserves none and is allocated the same way otherwise. */
export function allocateAmount(profile: Profile, books: VaultBooks, amount: bigint, options: { income: boolean; taxExtra?: bigint; rate?: Rate }) {
  // the profile states its obligations in dollars; a euro arrival is sized against them at the feed rate, a dollar arrival never needs one
  const euros = options.rate !== undefined && books.asset === "EURC";
  const asset = (dollars: bigint) => (euros && options.rate ? fromUsdc("EURC", dollars, options.rate) : dollars);
  return allocatePayment(money(books.asset, amount), {
    asset: books.asset,
    taxRateBps: options.income ? profile.taxRateBps : 0,
    taxBufferBps: profile.taxBufferBps,
    ...(options.income && options.taxExtra !== undefined && options.taxExtra > 0n ? { taxExtra: options.taxExtra } : {}),
    payrollDue: asset(BigInt(profile.payrollDue)),
    payrollFunded: books.payrollFunded,
    payrollShareBps: profile.payrollShareBps,
    dailySpend: asset(BigInt(profile.dailySpend)),
    operatingBalance: books.operating,
    floorDays: profile.floorDays,
    targetDays: profile.targetDays,
    salaryOwed: asset(BigInt(profile.salaryOwed)),
    emergencyTarget: asset(BigInt(profile.emergencyTarget)),
    emergencyBalance: books.emergency,
  });
}

export function planSplit(profile: Profile, books: VaultBooks, today: PlainDate): { boxes: number[]; amounts: bigint[]; next: Profile } {
  const result = allocateAmount(profile, books, books.unallocated, { income: true });
  const boxes: number[] = [];
  const amounts: bigint[] = [];
  for (const kind of BOX_KINDS) {
    const amount = result.byBox[kind].units;
    if (amount > 0n) {
      boxes.push(BOX_ID[kind]);
      amounts.push(amount);
    }
  }
  const recent = profile.history.filter(([date]) => daysBetween(parsePlainDate(date), today) < WINDOW_DAYS);
  const history = [...recent, [formatPlainDate(today), books.unallocated.toString(), "deposit"] as [string, string, string]].slice(-MAX_HISTORY);
  return { boxes, amounts, next: { ...profile, history, salaryOwed: result.salaryPending.units.toString() } };
}
