import { RuleError } from "../rule.js";
import { parseLocal } from "../local-money.js";
export const isRecord = (value) => typeof value === "object" && value !== null && !Array.isArray(value);
export function fail(problems) {
    throw new RuleError(problems.map((problem) => `params.${problem}`));
}
export function localField(source, field) {
    const value = source[field];
    try {
        if (typeof value !== "string")
            throw new RangeError();
        return parseLocal(value);
    }
    catch {
        return fail([`${field}: must be a decimal string with at most two decimals`]);
    }
}
export function intField(source, field, min, max) {
    const value = source[field];
    if (typeof value !== "number" || !Number.isInteger(value) || value < min || value > max)
        return fail([`${field}: must be an integer from ${min} to ${max}`]);
    return value;
}
export function currencyField(source) {
    const value = source.currency;
    if (typeof value !== "string" || !/^[A-Z]{3}$/.test(value))
        return fail(["currency: must be an ISO 4217 code in capitals"]);
    return value;
}
export function assertKind(rule, kind) {
    if (rule.kind !== kind)
        throw new Error(`expected a rule of kind "${kind}", got "${rule.kind}"`);
}
