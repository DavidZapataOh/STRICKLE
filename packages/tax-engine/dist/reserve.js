import { daysBetween } from "@strickle/core";
import { isCurrent } from "./rule.js";
import { FALLBACK_KIND, fallbackReserve } from "./kinds/fallback.js";
import { FLAT_RATE_KIND, estimateFlatRate } from "./kinds/flat-rate.js";
import { MEI_KIND, estimateMei } from "./kinds/mei.js";
import { MONOTRIBUTO_KIND, estimateMonotributo } from "./kinds/monotributo.js";
import { RESICO_KIND, estimateResico } from "./kinds/resico.js";
import { SAFE_HARBOR_KIND, safeHarborPayments } from "./kinds/safe-harbor.js";
import { SIMPLE_KIND, estimateSimple } from "./kinds/simple.js";
function ruleAmount(rule, regime, today) {
    switch (regime.kind) {
        case RESICO_KIND: {
            const result = estimateResico(rule, regime.input);
            return result.status === "ok" ? { amount: result.isrDue + result.vatDue } : "out-of-regime";
        }
        case MONOTRIBUTO_KIND: {
            const result = estimateMonotributo(rule, regime.input);
            return result.status === "ok" ? { amount: result.fee } : "out-of-regime";
        }
        case SIMPLE_KIND: {
            const result = estimateSimple(rule, regime.input);
            return result.status === "ok" ? { amount: result.advance } : "out-of-regime";
        }
        case MEI_KIND: {
            const result = estimateMei(rule, regime.input);
            return result.status === "ok" ? { amount: result.das } : "out-of-regime";
        }
        case FLAT_RATE_KIND: {
            const result = estimateFlatRate(rule, regime.input);
            return result.status === "ok" ? { amount: result.payable } : "out-of-regime";
        }
        case SAFE_HARBOR_KIND: {
            const next = safeHarborPayments(rule, regime.input).installments.find((installment) => daysBetween(today, installment.dueDate) >= 0);
            return { amount: next?.amount ?? 0n };
        }
    }
}
/** The amount to set aside for the country's next payment: from its current rule when the regime inputs are given, else the fallback estimate. */
export function reserveFor(rules, request) {
    const forCountry = rules.filter((rule) => rule.country === request.country);
    const current = forCountry.filter((rule) => isCurrent(rule, request.today));
    const rule = request.regime ? current.find((entry) => entry.kind === request.regime.kind) : undefined;
    let reason;
    if (rule && request.regime) {
        const result = ruleAmount(rule, request.regime, request.today);
        if (result !== "out-of-regime") {
            return { origin: "rule", country: request.country, amount: result.amount, ruleId: rule.id, regime: rule.regime, source: rule.source, verification: rule.verification };
        }
        reason = "out-of-regime";
    }
    else if (current.length > 0) {
        reason = "regime-input-missing";
    }
    else {
        reason = forCountry.length > 0 ? "rule-expired" : "no-rule";
    }
    const fallback = rules.find((entry) => entry.kind === FALLBACK_KIND);
    if (!fallback)
        throw new Error("no fallback rule loaded");
    const { amount, basis } = fallbackReserve(fallback, { lastYearIncome: request.lastYear.income, lastYearTax: request.lastYear.tax, yearToDate: request.yearToDate });
    return { origin: "fallback", country: request.country, amount, ruleId: fallback.id, reason, basis, source: fallback.source, verification: fallback.verification };
}
/** Countries with a current rule, and countries whose rules have all expired (these are on the fallback). */
export function coverage(rules, today) {
    const countries = [...new Set(rules.filter((rule) => rule.kind !== FALLBACK_KIND).map((rule) => rule.country))].sort();
    const withRule = countries.filter((country) => rules.some((rule) => rule.country === country && rule.kind !== FALLBACK_KIND && isCurrent(rule, today)));
    return { withRule, expired: countries.filter((country) => !withRule.includes(country)) };
}
