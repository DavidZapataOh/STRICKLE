import { plainDate } from "@strickle/core";
import { assertKind, currencyField, fail, intField, isRecord, localField } from "./params.js";
export const MONOTRIBUTO_KIND = "monotributo-monthly";
export function parseMonotributoParams(params) {
    if (!Array.isArray(params.categories) || params.categories.length === 0)
        return fail(["categories: must be a non-empty list"]);
    const categories = params.categories.map((entry) => {
        if (!isRecord(entry) || typeof entry.id !== "string" || entry.id === "")
            return fail(["categories: each entry needs an id"]);
        return { id: entry.id, incomeCap: localField(entry, "incomeCap"), services: localField(entry, "services"), goods: localField(entry, "goods") };
    });
    categories.forEach((category, i) => {
        if (i > 0 && category.incomeCap <= categories[i - 1].incomeCap)
            fail(["categories: income caps must be strictly increasing"]);
    });
    return { currency: currencyField(params), dueDay: intField(params, "dueDay", 1, 28), categories };
}
export function estimateMonotributo(rule, input) {
    assertKind(rule, MONOTRIBUTO_KIND);
    const params = parseMonotributoParams(rule.params);
    if (input.annualIncome < 0n)
        throw new RangeError("income must not be negative");
    const category = params.categories.find((entry) => input.annualIncome <= entry.incomeCap);
    if (!category)
        return { status: "out-of-regime", reason: "income exceeds the highest monotributo category" };
    return {
        status: "ok",
        category: category.id,
        fee: category[input.activity],
        headroom: category.incomeCap - input.annualIncome,
        dueDate: plainDate(input.period.year, input.period.month, params.dueDay),
    };
}
