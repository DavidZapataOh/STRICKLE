import { type Forecast, breachShareBps } from "./forecast.ts";

const integer = (value: number, min: number, max: number, name: string): void => {
  if (!Number.isInteger(value) || value < min || value > max) throw new RangeError(`${name} must be an integer from ${min} to ${max}, got ${value}`);
};

/** APR = d / (1 - d) x 365 / days gained, in basis points. */
export function earlyPaymentAprBps(discountBps: number, daysEarly: number): number {
  integer(discountBps, 1, 9_999, "discountBps");
  integer(daysEarly, 1, 3_650, "daysEarly");
  return Math.round((discountBps * 10_000 * 365) / ((10_000 - discountBps) * daysEarly));
}

/** The smallest discount (whole basis points, rounded up) whose APR reaches yield plus margin over the days gained. */
export function minDiscountBps(vaultYieldBps: number, marginBps: number, daysEarly: number): number {
  integer(vaultYieldBps, 0, 1_000_000, "vaultYieldBps");
  integer(marginBps, 0, 1_000_000, "marginBps");
  integer(daysEarly, 1, 3_650, "daysEarly");
  const numerator = (vaultYieldBps + marginBps) * daysEarly;
  const denominator = 365 * 10_000;
  return Math.ceil((10_000 * numerator) / (denominator + numerator));
}

/** A fair discount for a supplier that printed none: d = D/365 x (r_v + k_s) / 2. */
export function fairDiscountBps(vaultYieldBps: number, supplierRateBps: number, daysAdvanced: number): number {
  integer(vaultYieldBps, 0, 1_000_000, "vaultYieldBps");
  integer(supplierRateBps, 0, 1_000_000, "supplierRateBps");
  integer(daysAdvanced, 1, 3_650, "daysAdvanced");
  return Math.round((daysAdvanced * (vaultYieldBps + supplierRateBps)) / (2 * 365));
}

export interface EarlyPaymentPolicy {
  vaultYieldBps: number;
  marginBps?: number;
  epsilonBps?: number;
  floorDays?: number;
  horizonWeeks?: number;
  maxTotalNet?: bigint;
}

export interface Payable {
  id: string;
  amount: bigint;
  discountBps: number;
  /** Days left to use the discount; negative when it has expired. */
  daysToDiscountEnd: number;
  /** Days until the invoice is due: the days gained by paying now. */
  daysToDue: number;
}

export type RejectReason = "discount-expired" | "due-too-soon" | "apr-below-yield-plus-margin" | "liquidity-risk" | "not-selected";

export interface EarlyPaymentDecision {
  chosen: { id: string; net: bigint; discount: bigint; aprBps: number; benefit: bigint }[];
  rejected: { id: string; aprBps: number | null; reason: RejectReason }[];
  totalNet: bigint;
  breachBps: number;
}

const EXACT_LIMIT = 12;

const dueWeek = (daysToDue: number): number => Math.floor((daysToDue - 1) / 7);

/** The forecast as if the chosen invoices were paid now: lower by the net amount until the due week, higher by the discount from then on. */
export function withEarlyPayments(forecast: Forecast, chosen: readonly { net: bigint; discount: bigint; daysToDue: number }[]): Forecast {
  const totalNet = chosen.reduce((sum, item) => sum + item.net, 0n);
  const delta = Array.from({ length: forecast.weeks }, (_, week) =>
    chosen.reduce((sum, item) => sum + (week < dueWeek(item.daysToDue) ? -item.net : item.discount), 0n),
  );
  return { ...forecast, openingBalance: forecast.openingBalance - totalNet, paths: forecast.paths.map((path) => path.map((balance, week) => balance + (delta[week] as bigint))) };
}

interface Candidate {
  id: string;
  net: bigint;
  discount: bigint;
  aprBps: number;
  benefit: bigint;
  daysToDue: number;
}

export function decideEarlyPayments(payables: readonly Payable[], forecast: Forecast, dailySpend: bigint, policy: EarlyPaymentPolicy): EarlyPaymentDecision {
  const margin = policy.marginBps ?? 300;
  const epsilon = policy.epsilonBps ?? 200;
  const floorDays = policy.floorDays ?? 14;
  const horizon = Math.min(policy.horizonWeeks ?? 13, forecast.weeks);
  integer(policy.vaultYieldBps, 0, 1_000_000, "vaultYieldBps");
  integer(margin, 0, 1_000_000, "marginBps");
  integer(epsilon, 0, 9_999, "epsilonBps");
  integer(floorDays, 1, 3_650, "floorDays");
  integer(horizon, 1, 52, "horizonWeeks");
  if (dailySpend < 0n) throw new RangeError("dailySpend must not be negative");
  if (policy.maxTotalNet !== undefined && policy.maxTotalNet < 0n) throw new RangeError("maxTotalNet must not be negative");
  if (new Set(payables.map((p) => p.id)).size !== payables.length) throw new RangeError("duplicate payable id");

  const rejected: EarlyPaymentDecision["rejected"] = [];
  const eligible: Candidate[] = [];
  for (const p of payables) {
    if (p.amount <= 0n) throw new RangeError(`${p.id}: the amount must be positive`);
    integer(p.discountBps, 1, 9_999, `${p.id}.discountBps`);
    integer(p.daysToDiscountEnd, -3_650, 3_650, `${p.id}.daysToDiscountEnd`);
    integer(p.daysToDue, 0, 3_650, `${p.id}.daysToDue`);
    if (p.daysToDue < 1) {
      rejected.push({ id: p.id, aprBps: null, reason: "due-too-soon" });
      continue;
    }
    const aprBps = earlyPaymentAprBps(p.discountBps, p.daysToDue);
    const discount = (p.amount * BigInt(p.discountBps)) / 10_000n;
    const net = p.amount - discount;
    const forgone = (net * BigInt(policy.vaultYieldBps) * BigInt(p.daysToDue)) / 3_650_000n;
    const benefit = discount - forgone;
    if (p.daysToDiscountEnd < 0) rejected.push({ id: p.id, aprBps, reason: "discount-expired" });
    else if (aprBps <= policy.vaultYieldBps + margin || benefit <= 0n) rejected.push({ id: p.id, aprBps, reason: "apr-below-yield-plus-margin" });
    else eligible.push({ id: p.id, net, discount, aprBps, benefit, daysToDue: p.daysToDue });
  }

  const threshold = BigInt(floorDays) * dailySpend;
  const breach = (set: readonly Candidate[]): number => breachShareBps(withEarlyPayments(forecast, set), threshold, horizon);
  const feasible = (set: readonly Candidate[]): boolean => {
    if (policy.maxTotalNet !== undefined && set.reduce((sum, c) => sum + c.net, 0n) > policy.maxTotalNet) return false;
    return breach(set) <= epsilon;
  };

  let best: Candidate[] = [];
  if (eligible.length <= EXACT_LIMIT) {
    const sorted = [...eligible].sort((a, b) => (a.id < b.id ? -1 : 1));
    let bestBenefit = 0n;
    for (let mask = 1; mask < 1 << sorted.length; mask++) {
      const set = sorted.filter((_, i) => (mask >> i) & 1);
      const benefit = set.reduce((sum, c) => sum + c.benefit, 0n);
      const better = benefit > bestBenefit || (benefit === bestBenefit && best.length > 0 && set.length < best.length);
      if (better && feasible(set)) {
        best = set;
        bestBenefit = benefit;
      }
    }
  } else {
    for (const candidate of [...eligible].sort((a, b) => b.aprBps - a.aprBps || (a.id < b.id ? -1 : 1))) {
      if (feasible([...best, candidate])) best = [...best, candidate];
    }
  }

  const chosenIds = new Set(best.map((c) => c.id));
  for (const candidate of eligible.filter((c) => !chosenIds.has(c.id))) {
    rejected.push({ id: candidate.id, aprBps: candidate.aprBps, reason: feasible([candidate]) ? "not-selected" : "liquidity-risk" });
  }
  const order = new Map(payables.map((p, i) => [p.id, i]));
  rejected.sort((a, b) => (order.get(a.id) as number) - (order.get(b.id) as number));
  const chosen = [...best].sort((a, b) => b.aprBps - a.aprBps || (a.id < b.id ? -1 : 1)).map(({ id, net, discount, aprBps, benefit }) => ({ id, net, discount, aprBps, benefit }));
  return { chosen, rejected, totalNet: best.reduce((sum, c) => sum + c.net, 0n), breachBps: breach(best) };
}
