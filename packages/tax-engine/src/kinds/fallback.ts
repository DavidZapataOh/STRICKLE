import { mulDiv } from "@strickle/core";
import type { TaxRule } from "../rule.ts";
import { assertKind, intField } from "./params.ts";

export const FALLBACK_KIND = "fallback-effective-rate";

export function parseFallbackParams(params: Record<string, unknown>): { bufferBps: number } {
  return { bufferBps: intField(params, "bufferBps", 10_000, 100_000) };
}

export interface FallbackInput {
  lastYearIncome: bigint;
  lastYearTax: bigint;
  /** Income received so far this year. */
  yearToDate: bigint;
}

/** Last year's effective rate times year-to-date income times the buffer, rounded up so the reserve never falls short. */
export function fallbackReserve(rule: TaxRule, input: FallbackInput): bigint {
  assertKind(rule, FALLBACK_KIND);
  const { bufferBps } = parseFallbackParams(rule.params);
  if (input.lastYearIncome < 0n || input.lastYearTax < 0n || input.yearToDate < 0n) throw new RangeError("amounts must not be negative");
  if (input.lastYearIncome === 0n) throw new RangeError("last year's income must be positive to define an effective rate");
  return mulDiv(input.yearToDate * input.lastYearTax, BigInt(bufferBps), input.lastYearIncome * 10_000n, "ceil");
}

/** Once the real tax is known: the surplus goes back to the user as a refund, a shortfall is reported. */
export function settleFallback({ reserved, actualTax }: { reserved: bigint; actualTax: bigint }): { refund: bigint; shortfall: bigint } {
  if (reserved < 0n || actualTax < 0n) throw new RangeError("amounts must not be negative");
  return { refund: reserved > actualTax ? reserved - actualTax : 0n, shortfall: actualTax > reserved ? actualTax - reserved : 0n };
}
