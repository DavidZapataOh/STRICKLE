import { type PlainDate } from "@strickle/core";
import type { TaxRule } from "../rule.ts";
import type { Outcome } from "./outcome.ts";
export declare const MONOTRIBUTO_KIND = "monotributo-monthly";
export interface MonotributoCategory {
    id: string;
    incomeCap: bigint;
    services: bigint;
    goods: bigint;
}
export interface MonotributoParams {
    currency: string;
    dueDay: number;
    categories: MonotributoCategory[];
}
export declare function parseMonotributoParams(params: Record<string, unknown>): MonotributoParams;
export interface MonotributoInput {
    /** Gross income over the last twelve months, in minor units. */
    annualIncome: bigint;
    activity: "services" | "goods";
    period: {
        year: number;
        month: number;
    };
}
export interface MonotributoEstimate {
    category: string;
    fee: bigint;
    /** What is left under the category's income cap before moving up. */
    headroom: bigint;
    dueDate: PlainDate;
}
export declare function estimateMonotributo(rule: TaxRule, input: MonotributoInput): Outcome<MonotributoEstimate>;
