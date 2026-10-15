import type { Asset } from "./asset.ts";

export interface Money {
  readonly asset: Asset;
  readonly units: bigint;
}

export class AssetMismatchError extends Error {
  constructor(left: Asset, right: Asset) {
    super(`cannot combine ${left} with ${right}`);
    this.name = "AssetMismatchError";
  }
}

export const money = (asset: Asset, units: bigint): Money => ({ asset, units });

function assertSameAsset(a: Money, b: Money): void {
  if (a.asset !== b.asset) throw new AssetMismatchError(a.asset, b.asset);
}

export function add(a: Money, b: Money): Money {
  assertSameAsset(a, b);
  return money(a.asset, a.units + b.units);
}

export function sub(a: Money, b: Money): Money {
  assertSameAsset(a, b);
  return money(a.asset, a.units - b.units);
}

export function compare(a: Money, b: Money): -1 | 0 | 1 {
  assertSameAsset(a, b);
  return a.units < b.units ? -1 : a.units > b.units ? 1 : 0;
}

export function sum(asset: Asset, items: readonly Money[]): Money {
  return items.reduce(add, money(asset, 0n));
}
