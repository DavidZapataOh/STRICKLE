import { parsePlainDate } from "@strickle/core";
import { applyRateBps } from "../local-money.js";
import { assertKind, currencyField, fail, intField, isRecord, localField } from "./params.js";
export const SIMPLE_KIND = "simple-bimonthly";
const dateField = (source, field) => {
    try {
        return parsePlainDate(String(source[field]));
    }
    catch {
        return fail([`${field}: not a valid YYYY-MM-DD date`]);
    }
};
const listField = (params, field) => {
    const value = params[field];
    if (!Array.isArray(value))
        return fail([`${field}: must be a list`]);
    return value.map((entry) => (isRecord(entry) ? entry : fail([`${field}: each entry must be an object`])));
};
export function parseSimpleParams(params) {
    const brackets = listField(params, "brackets").map((entry) => ({ upToUvt: intField(entry, "upToUvt", 1, 1e9), rateBps: intField(entry, "rateBps", 0, 10_000) }));
    if (brackets.length === 0)
        fail(["brackets: must be a non-empty list"]);
    brackets.forEach((bracket, i) => {
        if (i > 0 && bracket.upToUvt <= brackets[i - 1].upToUvt)
            fail(["brackets: limits must be strictly increasing"]);
    });
    const advanceWindows = listField(params, "advanceWindows").map((entry) => ({ bimester: intField(entry, "bimester", 1, 6), from: dateField(entry, "from"), to: dateField(entry, "to") }));
    const annualDeclaration = listField(params, "annualDeclaration").map((entry) => {
        const digits = entry.digits;
        if (!Array.isArray(digits) || digits.some((d) => !Number.isInteger(d) || d < 0 || d > 9))
            return fail(["annualDeclaration: digits must be integers from 0 to 9"]);
        return { digits: digits, date: dateField(entry, "date") };
    });
    return {
        currency: currencyField(params),
        uvt: localField(params, "uvt"),
        brackets,
        advanceExemptBelowUvt: intField(params, "advanceExemptBelowUvt", 0, 1e9),
        advanceWindows,
        annualDeclaration,
    };
}
export function estimateSimple(rule, input) {
    assertKind(rule, SIMPLE_KIND);
    const params = parseSimpleParams(rule.params);
    if (input.annualIncome < 0n || input.bimesterIncome < 0n)
        throw new RangeError("income must not be negative");
    if (!Number.isInteger(input.bimester) || input.bimester < 1 || input.bimester > 6)
        throw new RangeError("bimester must be 1 to 6");
    const bracket = params.brackets.find((entry) => input.annualIncome < BigInt(entry.upToUvt) * params.uvt);
    if (!bracket)
        return { status: "out-of-regime", reason: `annual income reaches ${params.brackets.at(-1).upToUvt} UVT, the regime ceiling` };
    const advanceRequired = input.annualIncome >= BigInt(params.advanceExemptBelowUvt) * params.uvt;
    const window = params.advanceWindows.find((entry) => entry.bimester === input.bimester);
    return {
        status: "ok",
        rateBps: bracket.rateBps,
        advanceRequired,
        advance: advanceRequired ? applyRateBps(input.bimesterIncome, bracket.rateBps) : 0n,
        window: window ? { from: window.from, to: window.to } : null,
    };
}
/** Annual consolidated declaration date by the last digit of the NIT. */
export function simpleAnnualDeclarationDate(rule, nitLastDigit) {
    assertKind(rule, SIMPLE_KIND);
    if (!Number.isInteger(nitLastDigit) || nitLastDigit < 0 || nitLastDigit > 9)
        throw new RangeError("NIT digit must be 0 to 9");
    const entry = parseSimpleParams(rule.params).annualDeclaration.find((item) => item.digits.includes(nitLastDigit));
    if (!entry)
        throw new Error(`no declaration date for NIT digit ${nitLastDigit}`);
    return entry.date;
}
