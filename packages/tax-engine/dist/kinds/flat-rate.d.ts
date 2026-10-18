import { type PlainDate } from "@strickle/core";
import type { TaxRule } from "../rule.ts";
import type { Outcome } from "./outcome.ts";
export declare const FLAT_RATE_KIND = "flat-rate-receipts";
export interface FlatRateParams {
    currency: string;
    options: {
        id: string;
        rateBps: number;
    }[];
    allowance: bigint;
    receiptsCap: bigint | null;
    withheldAtSource: boolean;
    dueDates: {
        label: string;
        month: number;
        day: number;
        yearOffset: number;
    }[];
}
export declare function parseFlatRateParams(params: Record<string, unknown>): FlatRateParams;
export interface FlatRateInput {
    option: string;
    taxYear: number;
    /** Gross receipts so far this tax year, in minor units. */
    receiptsToDate: bigint;
    /** Tax already paid or withheld for the year. */
    paid: bigint;
}
export interface FlatRateEstimate {
    rateBps: number;
    taxToDate: bigint;
    payable: bigint;
    withheldAtSource: boolean;
    dueDates: {
        label: string;
        date: PlainDate;
    }[];
}
export declare function estimateFlatRate(rule: TaxRule, input: FlatRateInput): Outcome<FlatRateEstimate>;
