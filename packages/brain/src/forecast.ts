import { type PlainDate, addDays, daysBetween } from "@strickle/core";

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
