import { type Asset, type PlainDate, daysBetween } from "@strickle/core";

export type ArrivalClass = "income" | "own-transfer" | "refund";
export type Basis = "default" | "intent" | "outflow-return";
export type DoubtFlag = "own-address" | "amount-matches-outflow" | "outlier-size" | "unattributed";

export interface Arrival {
  id: string;
  asset: Asset;
  amount: bigint;
  sender: string | null;
  date: PlainDate;
}

export interface Sent {
  to: string;
  asset: Asset;
  amount: bigint;
  date: PlainDate;
  kind: "own" | "payee";
}

export interface Expectation {
  id: string;
  asset: Asset;
  min: bigint;
  max: bigint;
  expiresAt: number;
}

export interface IncomeContext {
  now: number;
  owners: readonly string[];
  expectations: readonly Expectation[];
  sent: readonly Sent[];
  recentMax: bigint;
}

export interface Part {
  amount: bigint;
  class: ArrivalClass;
  basis: Basis;
  flags: DoubtFlag[];
}

export interface Classified {
  parts: Part[];
  expectations: Expectation[];
  sent: Sent[];
}

export const LOOKBACK_DAYS = 90;
export const SENT_RETENTION_DAYS = 180;
export const OUTLIER_FACTOR = 10n;

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

/**
 * Not-income needs affirmative evidence: the user declared the deposit, or the sender is an address the vault paid within the lookback, up to what it was paid. Everything else is income, with doubt flags when something looks off. The parts always sum to the arrival.
 * The returned books are what remains after consumption; the inputs are never changed.
 */
export function classifyArrival(arrival: Arrival, context: IncomeContext): Classified {
  let expectations = [...context.expectations];
  let sent = context.sent.filter((entry) => daysBetween(entry.date, arrival.date) <= SENT_RETENTION_DAYS).map((entry) => ({ ...entry }));

  const declared = expectations.findIndex((e) => e.asset === arrival.asset && e.expiresAt > context.now && e.min <= arrival.amount && arrival.amount <= e.max);
  if (declared >= 0) {
    expectations = expectations.filter((_, index) => index !== declared);
    return { parts: [{ amount: arrival.amount, class: "own-transfer", basis: "intent", flags: [] }], expectations, sent };
  }

  const parts: Part[] = [];
  let remaining = arrival.amount;
  if (arrival.sender !== null) {
    const sender = arrival.sender;
    const eligible = sent
      .map((entry, index) => ({ entry, index }))
      .filter(({ entry }) => same(entry.to, sender) && entry.asset === arrival.asset && daysBetween(entry.date, arrival.date) <= LOOKBACK_DAYS)
      .sort((a, b) => daysBetween(b.entry.date, arrival.date) - daysBetween(a.entry.date, arrival.date));
    for (const { entry } of eligible) {
      if (remaining === 0n) break;
      const taken = remaining < entry.amount ? remaining : entry.amount;
      parts.push({ amount: taken, class: entry.kind === "own" ? "own-transfer" : "refund", basis: "outflow-return", flags: [] });
      entry.amount -= taken;
      remaining -= taken;
    }
    sent = sent.filter((entry) => entry.amount > 0n);
  }

  if (remaining > 0n) {
    const flags: DoubtFlag[] = [];
    if (arrival.sender !== null && context.owners.some((owner) => same(owner, arrival.sender as string))) flags.push("own-address");
    const sender = arrival.sender;
    if (sender !== null && sent.some((entry) => same(entry.to, sender) && entry.asset === arrival.asset && daysBetween(entry.date, arrival.date) > LOOKBACK_DAYS && entry.amount === remaining)) flags.push("amount-matches-outflow");
    if (context.recentMax > 0n && remaining > OUTLIER_FACTOR * context.recentMax) flags.push("outlier-size");
    if (sender === null && parts.length === 0) flags.push("unattributed");
    parts.push({ amount: remaining, class: "income", basis: "default", flags });
  }
  return { parts, expectations, sent };
}
