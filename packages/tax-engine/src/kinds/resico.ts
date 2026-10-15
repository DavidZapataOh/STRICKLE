import { plainDate, type PlainDate } from "@strickle/core";
import { applyRateBps } from "../local-money.ts";
import type { TaxRule } from "../rule.ts";
import type { Outcome } from "./outcome.ts";
import { assertKind, currencyField, fail, intField, isRecord, localField } from "./params.ts";

export const RESICO_KIND = "resico-monthly";

export interface ResicoParams {
  currency: string;
  brackets: { upTo: bigint; rateBps: number }[];
  annualCap: bigint;
  dueDay: number;
  withholdingRateBps: number;
  vatRateBps: number;
}

export function parseResicoParams(params: Record<string, unknown>): ResicoParams {
  if (!Array.isArray(params.brackets) || params.brackets.length === 0) return fail(["brackets: must be a non-empty list"]);
  const brackets = params.brackets.map((entry: unknown) => {
    if (!isRecord(entry)) return fail(["brackets: each entry must be an object"]);
    return { upTo: localField(entry, "upTo"), rateBps: intField(entry, "rateBps", 0, 10_000) };
  });
  brackets.forEach((bracket, i) => {
    if (i > 0 && bracket.upTo <= brackets[i - 1]!.upTo) fail(["brackets: upper limits must be strictly increasing"]);
  });
  return {
    currency: currencyField(params),
    brackets,
    annualCap: localField(params, "annualCap"),
    dueDay: intField(params, "dueDay", 1, 28),
    withholdingRateBps: intField(params, "withholdingRateBps", 0, 10_000),
    vatRateBps: intField(params, "vatRateBps", 0, 10_000),
  };
}

export interface ResicoInput {
  period: { year: number; month: number };
  /** Income collected in the month, without VAT, in minor units. */
  collected: bigint;
  /** Collected so far this year including this month. */
  yearToDate: bigint;
  isrWithheld?: bigint;
  vatCreditable?: bigint;
  vatWithheld?: bigint;
}

export interface ResicoEstimate {
  isr: bigint;
  isrDue: bigint;
  isrCredit: bigint;
  /** What a company paying this income would withhold (informational). */
  expectedCompanyWithholding: bigint;
  vatCharged: bigint;
  vatDue: bigint;
  vatCredit: bigint;
  dueDate: PlainDate;
}

export function estimateResico(rule: TaxRule, input: ResicoInput): Outcome<ResicoEstimate> {
  assertKind(rule, RESICO_KIND);
  const params = parseResicoParams(rule.params);
  if (input.collected < 0n || input.yearToDate < 0n) throw new RangeError("amounts must not be negative");
  if (input.yearToDate > params.annualCap) return { status: "out-of-regime", reason: "income collected this year exceeds the annual cap" };
  const bracket = params.brackets.find((entry) => input.collected <= entry.upTo);
  if (!bracket) return { status: "out-of-regime", reason: "monthly income exceeds the last bracket of the table" };

  const isr = applyRateBps(input.collected, bracket.rateBps);
  const withheld = input.isrWithheld ?? 0n;
  const vatCharged = applyRateBps(input.collected, params.vatRateBps);
  const vatOffset = (input.vatCreditable ?? 0n) + (input.vatWithheld ?? 0n);
  const next = input.period.month === 12 ? { year: input.period.year + 1, month: 1 } : { year: input.period.year, month: input.period.month + 1 };

  return {
    status: "ok",
    isr,
    isrDue: isr > withheld ? isr - withheld : 0n,
    isrCredit: withheld > isr ? withheld - isr : 0n,
    expectedCompanyWithholding: applyRateBps(input.collected, params.withholdingRateBps),
    vatCharged,
    vatDue: vatCharged > vatOffset ? vatCharged - vatOffset : 0n,
    vatCredit: vatOffset > vatCharged ? vatOffset - vatCharged : 0n,
    dueDate: plainDate(next.year, next.month, params.dueDay),
  };
}
