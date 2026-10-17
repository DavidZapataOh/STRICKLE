function positive(rate) {
    if (rate.usdcUsd <= 0n || rate.eurcUsd <= 0n)
        throw new RangeError("a rate must be positive");
}
/** What `units` of `asset` are worth in USDC units, rounded down. */
export function toUsdc(asset, units, rate) {
    positive(rate);
    return asset === "USDC" ? units : (units * rate.eurcUsd) / rate.usdcUsd;
}
/** How much of `asset` is worth `usdcUnits` USDC units, rounded down. */
export function fromUsdc(asset, usdcUnits, rate) {
    positive(rate);
    return asset === "USDC" ? usdcUnits : (usdcUnits * rate.usdcUsd) / rate.eurcUsd;
}
/** (quoted - expected) / expected in basis points, truncated toward zero. */
export function deviationBps(quoted, expected) {
    if (expected <= 0n)
        throw new RangeError("the expected amount must be positive");
    const bps = ((quoted - expected) * 10000n) / expected;
    return Number(bps > 1000000n ? 1000000n : bps < -1000000n ? -1000000n : bps);
}
/** What a swap of `amountIn` of `assetIn` should return at the feed prices. */
export function expectedOut(assetIn, amountIn, rate) {
    positive(rate);
    return assetIn === "USDC" ? (amountIn * rate.usdcUsd) / rate.eurcUsd : (amountIn * rate.eurcUsd) / rate.usdcUsd;
}
