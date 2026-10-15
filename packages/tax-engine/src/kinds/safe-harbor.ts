import { parsePlainDate, type PlainDate } from "@strickle/core";
import { applyRateBps } from "../local-money.ts";
import type { TaxRule } from "../rule.ts";
import { assertKind, currencyField, fail, intField, localField } from "./params.ts";

export const SAFE_HARBOR_KIND = "safe-harbor-quarterly";

export interface SafeHarborParams {
  currency: string;
  currentYearRateBps: number;
  priorYearRateBps: number;
  higherIncomePriorYearRateBps: number;
  higherIncomeAgiOver: bigint;
  higherIncomeAgiOverMarriedSeparate: bigint;
  dueDates: PlainDate[];
}

export function parseSafeHarborParams(params: Record<string, unknown>): SafeHarborParams {
  if (!Array.isArray(params.dueDates) || params.dueDates.length !== 4) return fail(["dueDates: must list exactly four dates"]);
  const dueDates = params.dueDates.map((entry: unknown) => {
    try {
      return parsePlainDate(String(entry));
    } catch {
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

export interface SafeHarborInput {
  /** Tax expected on this year's return, in minor units. */
  expectedTax: bigint;
  /** Total tax shown on last year's return (it must cover twelve months). */
  priorYearTax: bigint;
  priorYearAgi: bigint;
  marriedFilingSeparately: boolean;
  /** Withholding and credits already counted toward this year's tax. */
  withholdingAndCredits: bigint;
}

export interface SafeHarborEstimate {
  basis: "current-year-90" | "prior-year-100" | "prior-year-110";
  requiredAnnual: bigint;
  installments: { dueDate: PlainDate; amount: bigint }[];
}

export function safeHarborPayments(rule: TaxRule, input: SafeHarborInput): SafeHarborEstimate {
  assertKind(rule, SAFE_HARBOR_KIND);
  const params = parseSafeHarborParams(rule.params);
  if (input.expectedTax < 0n || input.priorYearTax < 0n || input.priorYearAgi < 0n || input.withholdingAndCredits < 0n) throw new RangeError("amounts must not be negative");

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
