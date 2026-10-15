import { plainDate, type PlainDate } from "@strickle/core";
import type { TaxRule } from "../rule.ts";
import type { Outcome } from "./outcome.ts";
import { assertKind, currencyField, fail, intField, isRecord, localField } from "./params.ts";

export const MONOTRIBUTO_KIND = "monotributo-monthly";

export interface MonotributoCategory {
  id: string;
  incomeCap: bigint;
  services: bigint;
  goods: bigint;
}

export interface MonotributoParams {
  currency: string;
  dueDay: number;
  categories: MonotributoCategory[];
}

export function parseMonotributoParams(params: Record<string, unknown>): MonotributoParams {
  if (!Array.isArray(params.categories) || params.categories.length === 0) return fail(["categories: must be a non-empty list"]);
  const categories = params.categories.map((entry: unknown) => {
    if (!isRecord(entry) || typeof entry.id !== "string" || entry.id === "") return fail(["categories: each entry needs an id"]);
    return { id: entry.id, incomeCap: localField(entry, "incomeCap"), services: localField(entry, "services"), goods: localField(entry, "goods") };
  });
  categories.forEach((category, i) => {
    if (i > 0 && category.incomeCap <= categories[i - 1]!.incomeCap) fail(["categories: income caps must be strictly increasing"]);
  });
  return { currency: currencyField(params), dueDay: intField(params, "dueDay", 1, 28), categories };
}

export interface MonotributoInput {
  /** Gross income over the last twelve months, in minor units. */
  annualIncome: bigint;
  activity: "services" | "goods";
  period: { year: number; month: number };
}

export interface MonotributoEstimate {
  category: string;
  fee: bigint;
  /** What is left under the category's income cap before moving up. */
  headroom: bigint;
  dueDate: PlainDate;
}

export function estimateMonotributo(rule: TaxRule, input: MonotributoInput): Outcome<MonotributoEstimate> {
  assertKind(rule, MONOTRIBUTO_KIND);
  const params = parseMonotributoParams(rule.params);
  if (input.annualIncome < 0n) throw new RangeError("income must not be negative");
  const category = params.categories.find((entry) => input.annualIncome <= entry.incomeCap);
  if (!category) return { status: "out-of-regime", reason: "income exceeds the highest monotributo category" };
  return {
    status: "ok",
    category: category.id,
    fee: category[input.activity],
    headroom: category.incomeCap - input.annualIncome,
    dueDate: plainDate(input.period.year, input.period.month, params.dueDay),
  };
}
