import { plainDate, type PlainDate } from "@strickle/core";
import type { TaxRule } from "../rule.ts";
import type { Outcome } from "./outcome.ts";
import { assertKind, currencyField, intField, localField } from "./params.ts";

export const MEI_KIND = "mei-monthly";

export interface MeiParams {
  currency: string;
  inss: bigint;
  carrierInss: bigint;
  iss: bigint;
  icms: bigint;
  annualCap: bigint;
  dueDay: number;
}

export function parseMeiParams(params: Record<string, unknown>): MeiParams {
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

export interface MeiInput {
  /** Gross revenue for the calendar year so far, in minor units. */
  annualRevenue: bigint;
  /** ICMS and ISS apply when the MEI sells goods or provides services respectively. */
  activity: { icms: boolean; iss: boolean; carrier: boolean };
  /** Competence month of the DAS. */
  period: { year: number; month: number };
}

export interface MeiEstimate {
  das: bigint;
  headroom: bigint;
  dueDate: PlainDate;
}

export function estimateMei(rule: TaxRule, input: MeiInput): Outcome<MeiEstimate> {
  assertKind(rule, MEI_KIND);
  const params = parseMeiParams(rule.params);
  if (input.annualRevenue < 0n) throw new RangeError("revenue must not be negative");
  if (input.annualRevenue > params.annualCap) return { status: "out-of-regime", reason: "revenue exceeds the MEI annual cap" };
  const { year, month } = input.period;
  return {
    status: "ok",
    das: (input.activity.carrier ? params.carrierInss : params.inss) + (input.activity.icms ? params.icms : 0n) + (input.activity.iss ? params.iss : 0n),
    headroom: params.annualCap - input.annualRevenue,
    dueDate: month === 12 ? plainDate(year + 1, 1, params.dueDay) : plainDate(year, month + 1, params.dueDay),
  };
}
