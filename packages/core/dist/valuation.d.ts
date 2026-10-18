import type { Asset } from "./asset.ts";
/** The two price-feed answers, each with eight decimals, in dollars. */
export interface Rate {
    usdcUsd: bigint;
    eurcUsd: bigint;
}
/** What `units` of `asset` are worth in USDC units, rounded down. */
export declare function toUsdc(asset: Asset, units: bigint, rate: Rate): bigint;
/** How much of `asset` is worth `usdcUnits` USDC units, rounded down. */
export declare function fromUsdc(asset: Asset, usdcUnits: bigint, rate: Rate): bigint;
/** (quoted - expected) / expected in basis points, truncated toward zero. */
export declare function deviationBps(quoted: bigint, expected: bigint): number;
/** What a swap of `amountIn` of `assetIn` should return at the feed prices. */
export declare function expectedOut(assetIn: Asset, amountIn: bigint, rate: Rate): bigint;
