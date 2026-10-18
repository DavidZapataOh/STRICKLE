import { type TaxRule } from "../rule.ts";
/** Fails if the rule's kind is unknown or its params do not parse for that kind. */
export declare function validateKind(rule: TaxRule): void;
