import type { Forecast } from "./forecast.ts";

export interface SalaryPolicy {
  floorDays?: number;
  epsilonBps?: number;
  horizonWeeks?: number;
  raiseStepBps?: number;
  raiseAfterMonths?: number;
  minHistoryWeeks?: number;
}

export type SalaryBinding = "full" | "taxes-not-covered" | "insufficient-history" | "spend-unknown" | "cushion-floor" | "scenario-risk" | "salary-box";

export interface SalaryInput {
  proposed: bigint;
  pending: bigint;
  /** What the salary box holds. */
  salaryBoxBalance: bigint;
  /** Operating cash plus the salary box: the money not yet earmarked to leave. */
  bufferBalance: bigint;
  taxesFunded: bigint;
  taxesDue: bigint;
  dailySpend: bigint;
  historyWeeks: number;
  /** Forecast of the buffer balance before this payment. */
  forecast: Forecast;
  policy?: SalaryPolicy;
}

export interface SalaryDecision {
  owed: bigint;
  payNow: bigint;
  pending: bigint;
  safeMax: bigint;
  ceilings: { box: bigint; cushion: bigint; scenarios: bigint };
  gates: { taxesCovered: boolean; historyOk: boolean; spendKnown: boolean };
  binding: SalaryBinding;
  /** Share of scenarios under the floor if `payNow` is paid, in basis points rounded up. */
  breachBps: number;
}

const DEFAULTS = { floorDays: 14, epsilonBps: 200, horizonWeeks: 9, raiseStepBps: 1_000, raiseAfterMonths: 2, minHistoryWeeks: 4 };

export function resolvePolicy(policy: SalaryPolicy = {}): Required<SalaryPolicy> {
  const p = { ...DEFAULTS, ...policy };
  const integer = (value: number, min: number, max: number, name: string) => {
    if (!Number.isInteger(value) || value < min || value > max) throw new RangeError(`${name} must be an integer from ${min} to ${max}, got ${value}`);
  };
  integer(p.floorDays, 1, 3_650, "floorDays");
  integer(p.epsilonBps, 0, 9_999, "epsilonBps");
  integer(p.horizonWeeks, 1, 52, "horizonWeeks");
  integer(p.raiseStepBps, 1, 10_000, "raiseStepBps");
  integer(p.raiseAfterMonths, 1, 24, "raiseAfterMonths");
  integer(p.minHistoryWeeks, 0, 13, "minHistoryWeeks");
  return p;
}

const smaller = (a: bigint, b: bigint) => (a < b ? a : b);

export function decideSalary(input: SalaryInput): SalaryDecision {
  const policy = resolvePolicy(input.policy);
  const { proposed, pending, salaryBoxBalance, bufferBalance, taxesFunded, taxesDue, dailySpend, historyWeeks, forecast } = input;
  if ([proposed, pending, salaryBoxBalance, bufferBalance, taxesFunded, taxesDue, dailySpend].some((amount) => amount < 0n)) throw new RangeError("amounts must not be negative");
  if (forecast.paths.length === 0) throw new RangeError("the forecast has no scenarios");
  if (forecast.openingBalance !== bufferBalance) throw new RangeError("the forecast opening balance must equal the buffer balance");

  const owed = proposed + pending;
  const floor = BigInt(policy.floorDays) * dailySpend;

  const slacks = forecast.paths
    .map((path) => path.slice(0, policy.horizonWeeks).reduce((lowest, balance) => smaller(lowest, balance), forecast.openingBalance) - floor)
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const allowed = Math.floor((policy.epsilonBps * slacks.length) / 10_000);
  const ceilings = { box: salaryBoxBalance, cushion: bufferBalance - floor, scenarios: slacks[allowed] as bigint };
  const gates = { taxesCovered: taxesFunded >= taxesDue, historyOk: historyWeeks >= policy.minHistoryWeeks, spendKnown: dailySpend > 0n };

  const limit = smaller(smaller(ceilings.box, ceilings.cushion), ceilings.scenarios);
  const open = gates.taxesCovered && gates.historyOk && gates.spendKnown;
  const safeMax = open && limit > 0n ? limit : 0n;
  const payNow = smaller(owed, safeMax);

  let binding: SalaryBinding;
  if (payNow === owed) binding = "full";
  else if (!gates.taxesCovered) binding = "taxes-not-covered";
  else if (!gates.historyOk) binding = "insufficient-history";
  else if (!gates.spendKnown) binding = "spend-unknown";
  else if (limit === ceilings.cushion) binding = "cushion-floor";
  else if (limit === ceilings.scenarios) binding = "scenario-risk";
  else binding = "salary-box";

  const breaches = slacks.filter((slack) => slack < payNow).length;
  return { owed, payNow, pending: owed - payNow, safeMax, ceilings, gates, binding, breachBps: Math.ceil((breaches * 10_000) / slacks.length) };
}
