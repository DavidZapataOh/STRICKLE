import { plainDate } from "@strickle/core";
import { applyRateBps } from "../local-money.js";
import { assertKind, currencyField, fail, intField, isRecord, localField } from "./params.js";
export const FLAT_RATE_KIND = "flat-rate-receipts";
export function parseFlatRateParams(params) {
    if (!Array.isArray(params.options) || params.options.length === 0)
        return fail(["options: must be a non-empty list"]);
    const options = params.options.map((entry) => {
        if (!isRecord(entry) || typeof entry.id !== "string" || entry.id === "")
            return fail(["options: each entry needs an id"]);
        return { id: entry.id, rateBps: intField(entry, "rateBps", 0, 10_000) };
    });
    if (typeof params.withheldAtSource !== "boolean")
        return fail(["withheldAtSource: must be a boolean"]);
    if (!Array.isArray(params.dueDates))
        return fail(["dueDates: must be a list"]);
    const dueDates = params.dueDates.map((entry) => {
        if (!isRecord(entry) || typeof entry.label !== "string" || entry.label === "")
            return fail(["dueDates: each entry needs a label"]);
        const month = intField(entry, "month", 1, 12);
        const day = intField(entry, "day", 1, 28);
        return { label: entry.label, month, day, yearOffset: intField(entry, "yearOffset", 0, 1) };
    });
    if (params.withheldAtSource === (dueDates.length > 0))
        return fail(["dueDates: required when self-assessed and empty when withheld at source"]);
    return {
        currency: currencyField(params),
        options,
        allowance: localField(params, "allowance"),
        receiptsCap: params.receiptsCap === undefined ? null : localField(params, "receiptsCap"),
        withheldAtSource: params.withheldAtSource,
        dueDates,
    };
}
export function estimateFlatRate(rule, input) {
    assertKind(rule, FLAT_RATE_KIND);
    const params = parseFlatRateParams(rule.params);
    if (input.receiptsToDate < 0n || input.paid < 0n)
        throw new RangeError("amounts must not be negative");
    const option = params.options.find((entry) => entry.id === input.option);
    if (!option)
        throw new RangeError(`unknown option "${input.option}"`);
    if (params.receiptsCap !== null && input.receiptsToDate > params.receiptsCap)
        return { status: "out-of-regime", reason: "receipts exceed the annual cap of the regime" };
    const taxable = input.receiptsToDate > params.allowance ? input.receiptsToDate - params.allowance : 0n;
    const taxToDate = applyRateBps(taxable, option.rateBps);
    return {
        status: "ok",
        rateBps: option.rateBps,
        taxToDate,
        payable: taxToDate > input.paid ? taxToDate - input.paid : 0n,
        withheldAtSource: params.withheldAtSource,
        dueDates: params.dueDates.map((entry) => ({ label: entry.label, date: plainDate(input.taxYear + entry.yearOffset, entry.month, entry.day) })),
    };
}
