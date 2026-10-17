import type { Asset } from "./asset.ts";

/** The two price-feed answers, each with eight decimals, in dollars. */
export interface Rate {
  usdcUsd: bigint;
  eurcUsd: bigint;
}

function positive(rate: Rate): void {
  if (rate.usdcUsd <= 0n || rate.eurcUsd <= 0n) throw new RangeError("a rate must be positive");
}

/** What `units` of `asset` are worth in USDC units, rounded down. */
export function toUsdc(asset: Asset, units: bigint, rate: Rate): bigint {
  positive(rate);
  return asset === "USDC" ? units : (units * rate.eurcUsd) / rate.usdcUsd;
}

/** How much of `asset` is worth `usdcUnits` USDC units, rounded down. */
export function fromUsdc(asset: Asset, usdcUnits: bigint, rate: Rate): bigint {
  positive(rate);
  return asset === "USDC" ? usdcUnits : (usdcUnits * rate.usdcUsd) / rate.eurcUsd;
}

/** (quoted - expected) / expected in basis points, truncated toward zero. */
export function deviationBps(quoted: bigint, expected: bigint): number {
  if (expected <= 0n) throw new RangeError("the expected amount must be positive");
  const bps = ((quoted - expected) * 10_000n) / expected;
  return Number(bps > 1_000_000n ? 1_000_000n : bps < -1_000_000n ? -1_000_000n : bps);
}

/** What a swap of `amountIn` of `assetIn` should return at the feed prices. */
export function expectedOut(assetIn: Asset, amountIn: bigint, rate: Rate): bigint {
  positive(rate);
  return assetIn === "USDC" ? (amountIn * rate.usdcUsd) / rate.eurcUsd : (amountIn * rate.eurcUsd) / rate.usdcUsd;
}
