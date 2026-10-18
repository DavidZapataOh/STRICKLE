import type { TaxRule } from "../rule.ts";
export declare const ELIGIBILITY_KIND = "eligibility-conditions";
export declare const COLLECTION_METHODS: readonly ["bank", "stablecoin"];
export type CollectionMethod = (typeof COLLECTION_METHODS)[number];
export declare const SAFE_PATH = "bank-and-mirror-mode";
export interface EligibilityCondition {
    id: string;
    description: string;
    /** Citation of the article or section, quoting the operative words. */
    basis: string;
    satisfiedBy: CollectionMethod[];
    violatedBy: CollectionMethod[];
}
export interface EligibilityParams {
    regime: string;
    benefit: string;
    safePath: typeof SAFE_PATH;
    note: string;
    conditions: EligibilityCondition[];
}
export declare function parseEligibilityParams(params: Record<string, unknown>): EligibilityParams;
export interface EligibilityInput {
    country: string;
    /** The benefit's `params.regime` id, not the rule's display regime. */
    regime: string;
    collectionMethod: CollectionMethod;
}
export type EligibilityResult = {
    status: "ok";
} | {
    status: "no-rules";
} | {
    status: "warn";
    benefit: string;
    conditions: Pick<EligibilityCondition, "id" | "description" | "basis">[];
    safePath: typeof SAFE_PATH;
    source: TaxRule["source"];
    verification: TaxRule["verification"];
    note: string;
};
/** Warns when the collection method breaks a condition of the benefit; "no-rules" is never an "ok". */
export declare function checkEligibility(rules: TaxRule | readonly TaxRule[], input: EligibilityInput): EligibilityResult;
