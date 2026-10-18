import { type PlainDate } from "@strickle/core";
export type Verification = {
    status: "unverified";
} | {
    status: "verified";
    verifiedBy: string;
    verifiedOn: PlainDate;
};
export interface TaxRule {
    id: string;
    country: string;
    regime: string;
    kind: string;
    version: string;
    validFrom: PlainDate;
    validTo: PlainDate;
    source: {
        title: string;
        url: string;
        retrievedOn: PlainDate;
    };
    verification: Verification;
    params: Record<string, unknown>;
}
export declare class RuleError extends Error {
    readonly problems: string[];
    constructor(problems: string[]);
}
/** Validates untrusted JSON into a rule, reporting every problem at once. */
export declare function parseRule(input: unknown): TaxRule;
export declare function isCurrent(rule: TaxRule, today: PlainDate): boolean;
