import { type Asset, type PlainDate, addDays, daysBetween } from "@strickle/core";
import { mulberry32, randomBelow } from "./prng.ts";

const WINDOW_WEEKS = 13;
const WINDOW_DAYS = WINDOW_WEEKS * 7;
const MIN_RECURRING_ENTRIES = 3;

/** An inflow is positive and an outflow negative. */
export interface CashEntry {
  date: PlainDate;
  amount: bigint;
  source: string;
}

export interface RecurringFlow {
  source: string;
  amount: bigint;
  everyDays: number;
  next: PlainDate;
}

export interface Decomposition {
  recurring: RecurringFlow[];
  /** Net total of the non-recurring flows per week of the window, week 0 being the most recent. */
  variableWeeks: bigint[];
  /** One-off income is not extrapolated: it is dropped from the variable weeks and reported here. */
  excludedOneOffIncome: bigint;
}

interface Dated {
  ago: number;
  amount: bigint;
  source: string;
}

const compareBigint = (a: bigint, b: bigint): number => (a < b ? -1 : a > b ? 1 : 0);
const compareText = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
const upperMedian = <T>(sorted: readonly T[]): T => sorted[Math.floor(sorted.length / 2)] as T;

function recurringFlow(source: string, entries: readonly Dated[], asOf: PlainDate): RecurringFlow | undefined {
  if (entries.length < MIN_RECURRING_ENTRIES) return undefined;
  const sign = (entries[0] as Dated).amount > 0n;
  if (entries.some((entry) => entry.amount === 0n || entry.amount > 0n !== sign)) return undefined;
  const gaps = entries.slice(1).map((entry, index) => (entries[index] as Dated).ago - entry.ago);
  const everyDays = upperMedian([...gaps].sort((a, b) => a - b));
  if (everyDays < 1 || gaps.some((gap) => Math.abs(gap - everyDays) * 4 > everyDays)) return undefined;
  const sinceLast = (entries[entries.length - 1] as Dated).ago;
  if (sinceLast > 2 * everyDays) return undefined;
  let offset = everyDays - sinceLast;
  while (offset <= 0) offset += everyDays;
  const amount = upperMedian(entries.map((entry) => entry.amount).sort(compareBigint));
  return { source, amount, everyDays, next: addDays(asOf, offset) };
}

/** Splits the last 91 days of cash entries into recurring flows and a weekly series of everything else. */
export function decompose(history: readonly CashEntry[], asOf: PlainDate): Decomposition {
  const bySource = new Map<string, Dated[]>();
  for (const { date, amount, source } of history) {
    const ago = daysBetween(date, asOf);
    if (ago < 0 || ago >= WINDOW_DAYS) continue;
    const entries = bySource.get(source);
    if (entries) entries.push({ ago, amount, source });
    else bySource.set(source, [{ ago, amount, source }]);
  }

  const recurring: RecurringFlow[] = [];
  const variableWeeks: bigint[] = Array.from({ length: WINDOW_WEEKS }, () => 0n);
  let excludedOneOffIncome = 0n;
  for (const source of [...bySource.keys()].sort(compareText)) {
    const entries = (bySource.get(source) as Dated[]).sort((a, b) => b.ago - a.ago || compareBigint(a.amount, b.amount));
    const flow = recurringFlow(source, entries, asOf);
    if (flow) {
      recurring.push(flow);
      continue;
    }
    for (const { ago, amount } of entries) {
      if (entries.length === 1 && amount > 0n) excludedOneOffIncome += amount;
      else variableWeeks[Math.floor(ago / 7)] = (variableWeeks[Math.floor(ago / 7)] as bigint) + amount;
    }
  }
  return { recurring, variableWeeks, excludedOneOffIncome };
}

export interface ForecastInput {
  asset: Asset;
  asOf: PlainDate;
  openingBalance: bigint;
  history: readonly CashEntry[];
  seed: number;
  scenarios?: number;
  weeks?: number;
}

export interface Forecast {
  asset: Asset;
  weeks: number;
  scenarios: number;
  openingBalance: bigint;
  /** Median and 10th percentile of the closing balance of each forecast week. */
  p50: bigint[];
  p10: bigint[];
  /** Closing balance per scenario and week: `paths[scenario][week]`. */
  paths: bigint[][];
}

const positiveInteger = (value: number, name: string): void => {
  if (!Number.isInteger(value) || value < 1) throw new RangeError(`${name} must be a positive integer, got ${value}`);
};

/** Nearest-rank percentile of an ascending list; `bps` is the percentile in basis points. */
export function percentile(sorted: readonly bigint[], bps: number): bigint {
  const rank = Math.max(1, Math.ceil((bps * sorted.length) / 10_000));
  return sorted[rank - 1] as bigint;
}

function recurringByWeek(recurring: readonly RecurringFlow[], asOf: PlainDate, weeks: number): bigint[] {
  const totals: bigint[] = Array.from({ length: weeks }, () => 0n);
  for (const { amount, everyDays, next } of recurring) {
    for (let offset = daysBetween(asOf, next); offset <= weeks * 7; offset += everyDays) {
      const week = Math.floor((offset - 1) / 7);
      totals[week] = (totals[week] as bigint) + amount;
    }
  }
  return totals;
}

/** Bootstrap forecast: each scenario redraws historical variable weeks on top of the recurring flows. */
export function forecast({ asset, asOf, openingBalance, history, seed, scenarios = 200, weeks = 13 }: ForecastInput): Forecast {
  positiveInteger(scenarios, "scenarios");
  positiveInteger(weeks, "weeks");
  const next = mulberry32(seed);
  const { recurring, variableWeeks } = decompose(history, asOf);
  const fixed = recurringByWeek(recurring, asOf, weeks);

  const paths: bigint[][] = [];
  for (let scenario = 0; scenario < scenarios; scenario++) {
    let balance = openingBalance;
    const path: bigint[] = [];
    for (let week = 0; week < weeks; week++) {
      balance += (variableWeeks[randomBelow(next, WINDOW_WEEKS)] as bigint) + (fixed[week] as bigint);
      path.push(balance);
    }
    paths.push(path);
  }

  const p50: bigint[] = [];
  const p10: bigint[] = [];
  for (let week = 0; week < weeks; week++) {
    const column = paths.map((path) => path[week] as bigint).sort(compareBigint);
    p50.push(percentile(column, 5_000));
    p10.push(percentile(column, 1_000));
  }
  return { asset, weeks, scenarios, openingBalance, p50, p10, paths };
}

/**
 * Share of scenarios, in basis points rounded up, whose balance drops below `threshold` at the start or in
 * any of the first `weeks` weeks.
 */
export function breachShareBps(f: Forecast, threshold: bigint, weeks: number): number {
  const horizon = Math.min(weeks, f.weeks);
  let breaches = 0;
  for (const path of f.paths) {
    let lowest = f.openingBalance;
    for (let week = 0; week < horizon; week++) {
      const balance = path[week] as bigint;
      if (balance < lowest) lowest = balance;
    }
    if (lowest < threshold) breaches++;
  }
  return Math.ceil((breaches * 10_000) / f.scenarios);
}
