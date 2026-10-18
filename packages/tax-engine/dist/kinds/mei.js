import { plainDate } from "@strickle/core";
import { assertKind, currencyField, intField, localField } from "./params.js";
export const MEI_KIND = "mei-monthly";
export function parseMeiParams(params) {
    return {
        currency: currencyField(params),
        inss: localField(params, "inss"),
        carrierInss: localField(params, "carrierInss"),
        iss: localField(params, "iss"),
        icms: localField(params, "icms"),
        annualCap: localField(params, "annualCap"),
        dueDay: intField(params, "dueDay", 1, 28),
    };
}
export function estimateMei(rule, input) {
    assertKind(rule, MEI_KIND);
    const params = parseMeiParams(rule.params);
    if (input.annualRevenue < 0n)
        throw new RangeError("revenue must not be negative");
    if (input.annualRevenue > params.annualCap)
        return { status: "out-of-regime", reason: "revenue exceeds the MEI annual cap" };
    const { year, month } = input.period;
    return {
        status: "ok",
        das: (input.activity.carrier ? params.carrierInss : params.inss) + (input.activity.icms ? params.icms : 0n) + (input.activity.iss ? params.iss : 0n),
        headroom: params.annualCap - input.annualRevenue,
        dueDate: month === 12 ? plainDate(year + 1, 1, params.dueDay) : plainDate(year, month + 1, params.dueDay),
    };
}
