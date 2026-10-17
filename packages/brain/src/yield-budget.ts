import { type BoxKind, type PlainDate, addDays, daysBetween, isoWeekday } from "@strickle/core";

export const INVEST_HORIZON_DAYS = 60;
export const REDEEM_LEAD_BUSINESS_DAYS = 5;
export const TAXES_MAX_BPS = 5_000;

export interface Obligation {
  box: BoxKind;
  due: PlainDate;
  amount: bigint;
}

/** Steps back over Monday to Friday only. No holiday calendar exists, so a date after a holiday is simply earlier in practice. */
export function businessDaysBefore(date: PlainDate, count: number): PlainDate {
  let day = date;
  let left = count;
  while (left > 0) {
    day = addDays(day, -1);
    if (isoWeekday(day) <= 5) left -= 1;
  }
  return day;
}

const atLeastZero = (value: bigint): bigint => (value > 0n ? value : 0n);

/** What a box can put to work now: its cash above what it must keep (the floor, or what falls due within 60 days, whichever is more), and within the share of the box the vault lets the agent invest, counting what already works. */
export function investableNow(input: { box: BoxKind; liquid: bigint; invested: bigint; floor: bigint; obligations: readonly Obligation[]; today: PlainDate; maxInvestBps: number }): bigint {
  const needed = input.obligations.filter((entry) => entry.box === input.box && daysBetween(input.today, entry.due) <= INVEST_HORIZON_DAYS).reduce((sum, entry) => sum + entry.amount, 0n);
  const spare = atLeastZero(input.liquid - (needed > input.floor ? needed : input.floor));
  const room = atLeastZero((BigInt(input.maxInvestBps) * (input.liquid + input.invested)) / 10_000n - input.invested);
  return spare < room ? spare : room;
}

/** What to bring back from the vault now: the cash the payments inside the lead window lack, plus one percent as a buffer, rounded up, never more than what works. A payment already past due is inside the window. */
export function redemptionsDue(input: { box: BoxKind; liquid: bigint; invested: bigint; obligations: readonly Obligation[]; today: PlainDate }): bigint {
  const needed = input.obligations
    .filter((entry) => entry.box === input.box && daysBetween(input.today, businessDaysBefore(entry.due, REDEEM_LEAD_BUSINESS_DAYS)) <= 0)
    .reduce((sum, entry) => sum + entry.amount, 0n);
  const shortfall = atLeastZero(needed - input.liquid);
  if (shortfall === 0n) return 0n;
  const withBuffer = (shortfall * 101n + 99n) / 100n;
  return withBuffer < input.invested ? withBuffer : input.invested;
}
