import { type PlainDate } from "@strickle/core";
import type { TaxRule } from "../rule.ts";
import type { Outcome } from "./outcome.ts";
export declare const SIMPLE_KIND = "simple-bimonthly";
export interface SimpleParams {
    currency: string;
    uvt: bigint;
    brackets: {
        upToUvt: number;
        rateBps: number;
    }[];
    advanceExemptBelowUvt: number;
    advanceWindows: {
        bimester: number;
        from: PlainDate;
        to: PlainDate;
    }[];
    annualDeclaration: {
        digits: number[];
        date: PlainDate;
    }[];
}
export declare function parseSimpleParams(params: Record<string, unknown>): SimpleParams;
export interface SimpleInput {
    /** Annual gross income used to pick the rate bracket (prior-year or projected), in minor units. */
    annualIncome: bigint;
    bimester: number;
    /** Gross income of the bimester, in minor units. */
    bimesterIncome: bigint;
}
export interface SimpleEstimate {
    rateBps: number;
    advanceRequired: boolean;
    advance: bigint;
    /** DIAN's published filing window for this bimester, or null when it has not been published. */
    window: {
        from: PlainDate;
        to: PlainDate;
    } | null;
}
export declare function estimateSimple(rule: TaxRule, input: SimpleInput): Outcome<SimpleEstimate>;
/** Annual consolidated declaration date by the last digit of the NIT. */
export declare function simpleAnnualDeclarationDate(rule: TaxRule, nitLastDigit: number): PlainDate;
