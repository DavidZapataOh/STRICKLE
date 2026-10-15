import { type Money, money } from "./money.ts";

const BPS_TOTAL = 10_000n;

export interface Share<K extends string = string> {
  readonly key: K;
  readonly bps: number;
}

export interface Allocation<K extends string = string> {
  readonly key: K;
  readonly amount: Money;
}

export function split<K extends string>(total: Money, shares: readonly Share<K>[]): Allocation<K>[] {
  if (total.units < 0n) throw new RangeError("cannot split a negative amount");
  if (shares.length === 0) throw new RangeError("at least one share is required");

  let bpsSum = 0n;
  for (const { key, bps } of shares) {
    if (!Number.isInteger(bps) || bps < 0) throw new RangeError(`share "${key}" has an invalid bps value: ${bps}`);
    bpsSum += BigInt(bps);
  }
  if (bpsSum !== BPS_TOTAL) throw new RangeError(`shares must add up to ${BPS_TOTAL} bps, got ${bpsSum}`);

  const scaled = shares.map(({ bps }) => total.units * BigInt(bps));
  const parts = scaled.map((n) => n / BPS_TOTAL);
  let leftover = total.units - parts.reduce((a, b) => a + b, 0n);

  const byRemainder = scaled
    .map((n, index) => ({ index, remainder: n % BPS_TOTAL }))
    .sort((a, b) => (a.remainder === b.remainder ? a.index - b.index : a.remainder > b.remainder ? -1 : 1));
  for (const { index } of byRemainder) {
    if (leftover === 0n) break;
    parts[index] = (parts[index] ?? 0n) + 1n;
    leftover -= 1n;
  }

  return shares.map(({ key }, i) => ({ key, amount: money(total.asset, parts[i] ?? 0n) }));
}
