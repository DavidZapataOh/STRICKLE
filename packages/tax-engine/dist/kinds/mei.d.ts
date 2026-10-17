import { type PlainDate } from "@strickle/core";
import type { TaxRule } from "../rule.ts";
import type { Outcome } from "./outcome.ts";
export declare const MEI_KIND = "mei-monthly";
export interface MeiParams {
    currency: string;
    inss: bigint;
    carrierInss: bigint;
    iss: bigint;
    icms: bigint;
    annualCap: bigint;
    dueDay: number;
}
export declare function parseMeiParams(params: Record<string, unknown>): MeiParams;
export interface MeiInput {
    /** Gross revenue for the calendar year so far, in minor units. */
    annualRevenue: bigint;
    /** ICMS and ISS apply when the MEI sells goods or provides services respectively. */
    activity: {
        icms: boolean;
        iss: boolean;
        carrier: boolean;
    };
    /** Competence month of the DAS. */
    period: {
        year: number;
        month: number;
    };
}
export interface MeiEstimate {
    das: bigint;
    headroom: bigint;
    dueDate: PlainDate;
}
export declare function estimateMei(rule: TaxRule, input: MeiInput): Outcome<MeiEstimate>;
