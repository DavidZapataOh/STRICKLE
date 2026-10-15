import { daysBetween, type PlainDate } from "@strickle/core";
import { isCurrent, type TaxRule, type Verification } from "./rule.ts";
import { FALLBACK_KIND, fallbackReserve, type FallbackReserve } from "./kinds/fallback.ts";
import { FLAT_RATE_KIND, estimateFlatRate, type FlatRateInput } from "./kinds/flat-rate.ts";
import { MEI_KIND, estimateMei, type MeiInput } from "./kinds/mei.ts";
import { MONOTRIBUTO_KIND, estimateMonotributo, type MonotributoInput } from "./kinds/monotributo.ts";
import { RESICO_KIND, estimateResico, type ResicoInput } from "./kinds/resico.ts";
import { SAFE_HARBOR_KIND, safeHarborPayments, type SafeHarborInput } from "./kinds/safe-harbor.ts";
import { SIMPLE_KIND, estimateSimple, type SimpleInput } from "./kinds/simple.ts";

export type RegimeInput =
  | { kind: typeof RESICO_KIND; input: ResicoInput }
  | { kind: typeof MONOTRIBUTO_KIND; input: MonotributoInput }
  | { kind: typeof SIMPLE_KIND; input: SimpleInput }
  | { kind: typeof MEI_KIND; input: MeiInput }
  | { kind: typeof SAFE_HARBOR_KIND; input: SafeHarborInput }
  | { kind: typeof FLAT_RATE_KIND; input: FlatRateInput };

export interface ReserveRequest {
  country: string;
  today: PlainDate;
  yearToDate: bigint;
  lastYear: { income: bigint; tax: bigint };
  /** Inputs of the country's regime; without them the fallback is used. */
  regime?: RegimeInput;
}

export type FallbackReason = "no-rule" | "rule-expired" | "regime-input-missing" | "out-of-regime";

interface Common {
  country: string;
  amount: bigint;
  ruleId: string;
  source: TaxRule["source"];
  verification: Verification;
}

export type Reserve = (Common & { origin: "rule"; regime: string }) | (Common & { origin: "fallback"; reason: FallbackReason; basis: FallbackReserve["basis"] });

type Amount = { amount: bigint } | "out-of-regime";

function ruleAmount(rule: TaxRule, regime: RegimeInput, today: PlainDate): Amount {
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
export function reserveFor(rules: readonly TaxRule[], request: ReserveRequest): Reserve {
  const forCountry = rules.filter((rule) => rule.country === request.country);
  const current = forCountry.filter((rule) => isCurrent(rule, request.today));
  const rule = request.regime ? current.find((entry) => entry.kind === request.regime!.kind) : undefined;

  let reason: FallbackReason;
  if (rule && request.regime) {
    const result = ruleAmount(rule, request.regime, request.today);
    if (result !== "out-of-regime") {
      return { origin: "rule", country: request.country, amount: result.amount, ruleId: rule.id, regime: rule.regime, source: rule.source, verification: rule.verification };
    }
    reason = "out-of-regime";
  } else if (current.length > 0) {
    reason = "regime-input-missing";
  } else {
    reason = forCountry.length > 0 ? "rule-expired" : "no-rule";
  }

  const fallback = rules.find((entry) => entry.kind === FALLBACK_KIND);
  if (!fallback) throw new Error("no fallback rule loaded");
  const { amount, basis } = fallbackReserve(fallback, { lastYearIncome: request.lastYear.income, lastYearTax: request.lastYear.tax, yearToDate: request.yearToDate });
  return { origin: "fallback", country: request.country, amount, ruleId: fallback.id, reason, basis, source: fallback.source, verification: fallback.verification };
}

/** Countries with a current rule, and countries whose rules have all expired (these are on the fallback). */
export function coverage(rules: readonly TaxRule[], today: PlainDate): { withRule: string[]; expired: string[] } {
  const countries = [...new Set(rules.filter((rule) => rule.kind !== FALLBACK_KIND).map((rule) => rule.country))].sort();
  const withRule = countries.filter((country) => rules.some((rule) => rule.country === country && rule.kind !== FALLBACK_KIND && isCurrent(rule, today)));
  return { withRule, expired: countries.filter((country) => !withRule.includes(country)) };
}
