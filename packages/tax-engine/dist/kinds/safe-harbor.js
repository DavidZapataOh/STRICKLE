import { parsePlainDate } from "@strickle/core";
import { applyRateBps } from "../local-money.js";
import { assertKind, currencyField, fail, intField, localField } from "./params.js";
export const SAFE_HARBOR_KIND = "safe-harbor-quarterly";
export function parseSafeHarborParams(params) {
    if (!Array.isArray(params.dueDates) || params.dueDates.length !== 4)
        return fail(["dueDates: must list exactly four dates"]);
    const dueDates = params.dueDates.map((entry) => {
        try {
            return parsePlainDate(String(entry));
        }
        catch {
            return fail(["dueDates: each entry must be a YYYY-MM-DD date"]);
        }
    });
    return {
        currency: currencyField(params),
        currentYearRateBps: intField(params, "currentYearRateBps", 0, 100_000),
        priorYearRateBps: intField(params, "priorYearRateBps", 0, 100_000),
        higherIncomePriorYearRateBps: intField(params, "higherIncomePriorYearRateBps", 0, 100_000),
        higherIncomeAgiOver: localField(params, "higherIncomeAgiOver"),
        higherIncomeAgiOverMarriedSeparate: localField(params, "higherIncomeAgiOverMarriedSeparate"),
        dueDates,
    };
}
export function safeHarborPayments(rule, input) {
    assertKind(rule, SAFE_HARBOR_KIND);
    const params = parseSafeHarborParams(rule.params);
    if (input.expectedTax < 0n || input.priorYearTax < 0n || input.priorYearAgi < 0n || input.withholdingAndCredits < 0n)
        throw new RangeError("amounts must not be negative");
    const threshold = input.marriedFilingSeparately ? params.higherIncomeAgiOverMarriedSeparate : params.higherIncomeAgiOver;
    const higherIncome = input.priorYearAgi > threshold;
    const fromCurrent = applyRateBps(input.expectedTax, params.currentYearRateBps);
    const fromPrior = applyRateBps(input.priorYearTax, higherIncome ? params.higherIncomePriorYearRateBps : params.priorYearRateBps);
    const priorBasis = higherIncome ? "prior-year-110" : "prior-year-100";
    const requiredAnnual = fromCurrent < fromPrior ? fromCurrent : fromPrior;
    const toPay = requiredAnnual > input.withholdingAndCredits ? requiredAnnual - input.withholdingAndCredits : 0n;
    const quarter = toPay / 4n;
    return {
        basis: fromCurrent < fromPrior ? "current-year-90" : priorBasis,
        requiredAnnual,
        installments: params.dueDates.map((dueDate, i) => ({ dueDate, amount: i === 3 ? toPay - 3n * quarter : quarter })),
    };
}
