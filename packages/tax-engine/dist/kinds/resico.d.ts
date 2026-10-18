import { type PlainDate } from "@strickle/core";
import type { TaxRule } from "../rule.ts";
import type { Outcome } from "./outcome.ts";
export declare const RESICO_KIND = "resico-monthly";
export interface ResicoParams {
    currency: string;
    brackets: {
        upTo: bigint;
        rateBps: number;
    }[];
    annualCap: bigint;
    dueDay: number;
    withholdingRateBps: number;
    vatRateBps: number;
}
export declare function parseResicoParams(params: Record<string, unknown>): ResicoParams;
export interface ResicoInput {
    period: {
        year: number;
        month: number;
    };
    /** Income collected in the month, without VAT, in minor units. */
    collected: bigint;
    /** Collected so far this year including this month. */
    yearToDate: bigint;
    isrWithheld?: bigint;
    vatCreditable?: bigint;
    vatWithheld?: bigint;
}
export interface ResicoEstimate {
    isr: bigint;
    isrDue: bigint;
    isrCredit: bigint;
    /** What a company paying this income would withhold (informational). */
    expectedCompanyWithholding: bigint;
    vatCharged: bigint;
    vatDue: bigint;
    vatCredit: bigint;
    dueDate: PlainDate;
}
export declare function estimateResico(rule: TaxRule, input: ResicoInput): Outcome<ResicoEstimate>;
