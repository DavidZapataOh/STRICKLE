import { type PlainDate } from "@strickle/core";
import type { TaxRule } from "../rule.ts";
export declare const SAFE_HARBOR_KIND = "safe-harbor-quarterly";
export interface SafeHarborParams {
    currency: string;
    currentYearRateBps: number;
    priorYearRateBps: number;
    higherIncomePriorYearRateBps: number;
    higherIncomeAgiOver: bigint;
    higherIncomeAgiOverMarriedSeparate: bigint;
    dueDates: PlainDate[];
}
export declare function parseSafeHarborParams(params: Record<string, unknown>): SafeHarborParams;
export interface SafeHarborInput {
    /** Tax expected on this year's return, in minor units. */
    expectedTax: bigint;
    /** Total tax shown on last year's return (it must cover twelve months). */
    priorYearTax: bigint;
    priorYearAgi: bigint;
    marriedFilingSeparately: boolean;
    /** Withholding and credits already counted toward this year's tax. */
    withholdingAndCredits: bigint;
}
export interface SafeHarborEstimate {
    basis: "current-year-90" | "prior-year-100" | "prior-year-110";
    requiredAnnual: bigint;
    installments: {
        dueDate: PlainDate;
        amount: bigint;
    }[];
}
export declare function safeHarborPayments(rule: TaxRule, input: SafeHarborInput): SafeHarborEstimate;
