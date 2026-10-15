import type { TaxRule } from "../rule.ts";
import { fail, isRecord } from "./params.ts";

export const ELIGIBILITY_KIND = "eligibility-conditions";

export const COLLECTION_METHODS = ["bank", "stablecoin"] as const;
export type CollectionMethod = (typeof COLLECTION_METHODS)[number];

export const SAFE_PATH = "bank-and-mirror-mode";

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

const textField = (source: Record<string, unknown>, field: string): string => {
  const value = source[field];
  return typeof value === "string" && value.trim() !== "" ? value : fail([`${field}: must not be blank`]);
};

const methodList = (source: Record<string, unknown>, field: string): CollectionMethod[] => {
  const value = source[field];
  if (!Array.isArray(value) || value.some((method) => !COLLECTION_METHODS.includes(method as CollectionMethod))) {
    return fail([`${field}: must be a list of collection methods (${COLLECTION_METHODS.join(", ")})`]);
  }
  return value as CollectionMethod[];
};

export function parseEligibilityParams(params: Record<string, unknown>): EligibilityParams {
  if (params.safePath !== SAFE_PATH) fail([`safePath: must be "${SAFE_PATH}"`]);
  if (!Array.isArray(params.conditions) || params.conditions.length === 0) fail(["conditions: must be a non-empty list"]);

  const seen = new Set<string>();
  const conditions = (params.conditions as unknown[]).map((entry): EligibilityCondition => {
    if (!isRecord(entry)) return fail(["conditions: each entry must be an object"]);
    const id = textField(entry, "id");
    if (seen.has(id)) fail([`conditions: duplicate id "${id}"`]);
    seen.add(id);
    const satisfiedBy = methodList(entry, "satisfiedBy");
    const violatedBy = methodList(entry, "violatedBy");
    if (satisfiedBy.some((method) => violatedBy.includes(method))) fail([`conditions.${id}: satisfiedBy and violatedBy must be disjoint`]);
    if (COLLECTION_METHODS.some((method) => !satisfiedBy.includes(method) && !violatedBy.includes(method))) {
      fail([`conditions.${id}: satisfiedBy and violatedBy must cover every collection method`]);
    }
    return { id, description: textField(entry, "description"), basis: textField(entry, "basis"), satisfiedBy, violatedBy };
  });

  return { regime: textField(params, "regime"), benefit: textField(params, "benefit"), safePath: SAFE_PATH, note: textField(params, "note"), conditions };
}

export interface EligibilityInput {
  country: string;
  /** The benefit's `params.regime` id, not the rule's display regime. */
  regime: string;
  collectionMethod: CollectionMethod;
}

export type EligibilityResult =
  | { status: "ok" }
  | { status: "no-rules" }
  | {
      status: "warn";
      benefit: string;
      conditions: Pick<EligibilityCondition, "id" | "description" | "basis">[];
      safePath: typeof SAFE_PATH;
      source: TaxRule["source"];
      verification: TaxRule["verification"];
      note: string;
    };

/** Warns when the collection method breaks a condition of the benefit; "no-rules" is never an "ok". */
export function checkEligibility(rules: TaxRule | readonly TaxRule[], input: EligibilityInput): EligibilityResult {
  if (!COLLECTION_METHODS.includes(input.collectionMethod)) throw new RangeError(`unknown collection method "${String(input.collectionMethod)}"`);

  const list = Array.isArray(rules) ? rules : [rules as TaxRule];
  for (const rule of list) {
    if (rule.kind !== ELIGIBILITY_KIND || rule.country !== input.country) continue;
    const params = parseEligibilityParams(rule.params);
    if (params.regime !== input.regime) continue;

    const broken = params.conditions.filter((condition) => condition.violatedBy.includes(input.collectionMethod));
    if (broken.length === 0) return { status: "ok" };
    return {
      status: "warn",
      benefit: params.benefit,
      conditions: broken.map(({ id, description, basis }) => ({ id, description, basis })),
      safePath: params.safePath,
      source: rule.source,
      verification: rule.verification,
      note: params.note,
    };
  }
  return { status: "no-rules" };
}
