import type { TaxRule } from "../rule.ts";
export declare const FALLBACK_KIND = "fallback-effective-rate";
export declare function parseFallbackParams(params: Record<string, unknown>): {
    bufferBps: number;
    firstYearRateBps: number;
};
export interface FallbackInput {
    lastYearIncome: bigint;
    lastYearTax: bigint;
    /** Income received so far this year. */
    yearToDate: bigint;
}
export interface FallbackReserve {
    amount: bigint;
    basis: "effective-rate" | "first-year-flat";
}
/**
 * Last year's effective rate times year-to-date income times the buffer; a user with no prior-year income gets a flat rate
 * on year-to-date income instead (the buffer is not stacked on it). Rounded up so the reserve never falls short.
 */
export declare function fallbackReserve(rule: TaxRule, input: FallbackInput): FallbackReserve;
/** Once the real tax is known: the surplus goes back to the user as a refund, a shortfall is reported. */
export declare function settleFallback({ reserved, actualTax }: {
    reserved: bigint;
    actualTax: bigint;
}): {
    refund: bigint;
    shortfall: bigint;
};
