import { fail, isRecord } from "./params.js";
export const ELIGIBILITY_KIND = "eligibility-conditions";
export const COLLECTION_METHODS = ["bank", "stablecoin"];
export const SAFE_PATH = "bank-and-mirror-mode";
const textField = (source, field) => {
    const value = source[field];
    return typeof value === "string" && value.trim() !== "" ? value : fail([`${field}: must not be blank`]);
};
const methodList = (source, field) => {
    const value = source[field];
    if (!Array.isArray(value) || value.some((method) => !COLLECTION_METHODS.includes(method))) {
        return fail([`${field}: must be a list of collection methods (${COLLECTION_METHODS.join(", ")})`]);
    }
    return value;
};
export function parseEligibilityParams(params) {
    if (params.safePath !== SAFE_PATH)
        fail([`safePath: must be "${SAFE_PATH}"`]);
    if (!Array.isArray(params.conditions) || params.conditions.length === 0)
        fail(["conditions: must be a non-empty list"]);
    const seen = new Set();
    const conditions = params.conditions.map((entry) => {
        if (!isRecord(entry))
            return fail(["conditions: each entry must be an object"]);
        const id = textField(entry, "id");
        if (seen.has(id))
            fail([`conditions: duplicate id "${id}"`]);
        seen.add(id);
        const satisfiedBy = methodList(entry, "satisfiedBy");
        const violatedBy = methodList(entry, "violatedBy");
        if (satisfiedBy.some((method) => violatedBy.includes(method)))
            fail([`conditions.${id}: satisfiedBy and violatedBy must be disjoint`]);
        if (COLLECTION_METHODS.some((method) => !satisfiedBy.includes(method) && !violatedBy.includes(method))) {
            fail([`conditions.${id}: satisfiedBy and violatedBy must cover every collection method`]);
        }
        return { id, description: textField(entry, "description"), basis: textField(entry, "basis"), satisfiedBy, violatedBy };
    });
    return { regime: textField(params, "regime"), benefit: textField(params, "benefit"), safePath: SAFE_PATH, note: textField(params, "note"), conditions };
}
/** Warns when the collection method breaks a condition of the benefit; "no-rules" is never an "ok". */
export function checkEligibility(rules, input) {
    if (!COLLECTION_METHODS.includes(input.collectionMethod))
        throw new RangeError(`unknown collection method "${String(input.collectionMethod)}"`);
    const list = Array.isArray(rules) ? rules : [rules];
    for (const rule of list) {
        if (rule.kind !== ELIGIBILITY_KIND || rule.country !== input.country)
            continue;
        const params = parseEligibilityParams(rule.params);
        if (params.regime !== input.regime)
            continue;
        const broken = params.conditions.filter((condition) => condition.violatedBy.includes(input.collectionMethod));
        if (broken.length === 0)
            return { status: "ok" };
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
