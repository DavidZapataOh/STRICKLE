import { RuleError, type TaxRule } from "../rule.ts";
import { parseLocal } from "../local-money.ts";

export const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

export function fail(problems: string[]): never {
  throw new RuleError(problems.map((problem) => `params.${problem}`));
}

export function localField(source: Record<string, unknown>, field: string): bigint {
  const value = source[field];
  try {
    if (typeof value !== "string") throw new RangeError();
    return parseLocal(value);
  } catch {
    return fail([`${field}: must be a decimal string with at most two decimals`]);
  }
}

export function intField(source: Record<string, unknown>, field: string, min: number, max: number): number {
  const value = source[field];
  if (typeof value !== "number" || !Number.isInteger(value) || value < min || value > max) return fail([`${field}: must be an integer from ${min} to ${max}`]);
  return value;
}

export function currencyField(source: Record<string, unknown>): string {
  const value = source.currency;
  if (typeof value !== "string" || !/^[A-Z]{3}$/.test(value)) return fail(["currency: must be an ISO 4217 code in capitals"]);
  return value;
}

export function assertKind(rule: TaxRule, kind: string): void {
  if (rule.kind !== kind) throw new Error(`expected a rule of kind "${kind}", got "${rule.kind}"`);
}
