import { mulDiv } from "@strickle/core";
import { assertKind, intField } from "./params.js";
export const FALLBACK_KIND = "fallback-effective-rate";
export function parseFallbackParams(params) {
    return { bufferBps: intField(params, "bufferBps", 10_000, 100_000), firstYearRateBps: intField(params, "firstYearRateBps", 0, 10_000) };
}
/**
 * Last year's effective rate times year-to-date income times the buffer; a user with no prior-year income gets a flat rate
 * on year-to-date income instead (the buffer is not stacked on it). Rounded up so the reserve never falls short.
 */
export function fallbackReserve(rule, input) {
    assertKind(rule, FALLBACK_KIND);
    const { bufferBps, firstYearRateBps } = parseFallbackParams(rule.params);
    if (input.lastYearIncome < 0n || input.lastYearTax < 0n || input.yearToDate < 0n)
        throw new RangeError("amounts must not be negative");
    if (input.lastYearIncome === 0n)
        return { amount: mulDiv(input.yearToDate, BigInt(firstYearRateBps), 10000n, "ceil"), basis: "first-year-flat" };
    return { amount: mulDiv(input.yearToDate * input.lastYearTax, BigInt(bufferBps), input.lastYearIncome * 10000n, "ceil"), basis: "effective-rate" };
}
/** Once the real tax is known: the surplus goes back to the user as a refund, a shortfall is reported. */
export function settleFallback({ reserved, actualTax }) {
    if (reserved < 0n || actualTax < 0n)
        throw new RangeError("amounts must not be negative");
    return { refund: reserved > actualTax ? reserved - actualTax : 0n, shortfall: actualTax > reserved ? actualTax - reserved : 0n };
}
