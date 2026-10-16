import { join } from "node:path";
import { type BoxKind, BOX_KINDS, type PlainDate, allocatePayment, money, mulDiv } from "@strickle/core";
import {
  type EligibilityResult, MEI_KIND, MONOTRIBUTO_KIND, RESICO_KIND, type RegimeInput, SIMPLE_KIND, type TaxRule,
  applyRateBps, checkEligibility, estimateSimple, fetchSeries, isCurrent, loadFxSources, loadRules, parseResicoParams, reserveFor,
} from "@strickle/tax-engine";
import type { Country, Ready } from "./types.ts";

export type FallbackCode = "no-rule" | "expired" | "other-regime" | "rate-unavailable" | "needs-prior-year" | "out-of-regime";
export type RateBasis = "monthly" | "fixed-fee" | "advance" | "annual" | "flat";

export interface TaxBasis {
  rateBps: number;
  origin: "rule" | "fallback";
  ruleId: string;
  regime: string;
  verified: boolean;
  sourceUrl: string;
  basis: RateBasis;
  fallback?: FallbackCode;
  fx: "used" | "not-needed" | "unavailable";
}

export interface MonthPlan {
  byBox: Record<BoxKind, bigint>;
  salaryPending: bigint;
  firstPayment: Record<BoxKind, bigint>;
}

export interface Diagnosis {
  tax: TaxBasis;
  rateBps: number;
  /** The user's first month, from empty boxes: the operating cash is still being filled, so later months split differently. */
  month: MonthPlan;
  dailySpend: bigint;
  emergencyTarget: bigint;
  firstMonthReserve: bigint;
  eligibility: EligibilityResult | { status: "not-applicable" };
}

const CURRENCY: Partial<Record<Country, string>> = { AR: "ARS", BR: "BRL", CO: "COP", MX: "MXN" };
const ELIGIBILITY_REGIME: Partial<Record<Country, string>> = { MX: "export-services-vat-zero" };

const parseSpot = (spot: string): bigint => {
  const match = /^([0-9]{1,9})(?:\.([0-9]{1,6}))?$/.exec(spot);
  const micro = match ? BigInt(match[1]!) * 1_000_000n + BigInt((match[2] ?? "").padEnd(6, "0") || "0") : 0n;
  if (micro <= 0n) throw new RangeError(`not a positive spot rate: "${spot}"`);
  return micro;
};

/** USD base units (six decimals) to local-currency minor units (two decimals) at `spot` local units per dollar. */
export const monthlyLocalMinor = (usdUnits: bigint, spot: string): bigint => mulDiv(usdUnits, parseSpot(spot), 10_000_000_000n, "halfEven");
export const usdUnitsFromLocalMinor = (minor: bigint, spot: string): bigint => mulDiv(minor, 10_000_000_000n, parseSpot(spot), "halfEven");

const currentRule = (rules: readonly TaxRule[], country: string, kind: string, today: PlainDate): TaxRule | undefined =>
  rules.find((rule) => rule.country === country && rule.kind === kind && isCurrent(rule, today));

function regimeFor(answers: Ready, localMonthly: bigint, today: PlainDate, vatRelief: boolean, rules: readonly TaxRule[]): RegimeInput | undefined {
  if (answers.regime !== "coded") return undefined;
  const period = { year: today.year, month: today.month };
  const monthsSoFar = BigInt(today.month);
  switch (answers.country) {
    case "MX": {
      const rule = currentRule(rules, "MX", RESICO_KIND, today);
      // Services exported to foreign clients are zero-rated: the VAT the engine charges is offset in full. Only when the guardian says the
      // conditions hold; while it warns, the VAT stays reserved.
      const vatWithheld = vatRelief && rule ? applyRateBps(localMonthly, parseResicoParams(rule.params).vatRateBps) : 0n;
      return { kind: RESICO_KIND, input: { period, collected: localMonthly, yearToDate: localMonthly * monthsSoFar, vatWithheld } };
    }
    case "AR":
      return { kind: MONOTRIBUTO_KIND, input: { annualIncome: localMonthly * 12n, activity: "services", period } };
    case "CO":
      return { kind: SIMPLE_KIND, input: { annualIncome: localMonthly * 12n, bimester: Math.ceil(today.month / 2), bimesterIncome: localMonthly * 2n } };
    case "BR":
      return { kind: MEI_KIND, input: { annualRevenue: localMonthly * monthsSoFar, activity: { icms: false, iss: true, carrier: false }, period } };
    default:
      return undefined;
  }
}

function fallbackCode(reason: string, answers: Ready, spotMissing: boolean): FallbackCode {
  switch (reason) {
    case "no-rule":
      return "no-rule";
    case "rule-expired":
      return "expired";
    case "out-of-regime":
      return "out-of-regime";
    default:
      if (answers.regime === "other") return "other-regime";
      return CURRENCY[answers.country] !== undefined && answers.regime === "coded" && spotMissing ? "rate-unavailable" : "needs-prior-year";
  }
}

const BASIS: Record<string, RateBasis> = { [RESICO_KIND]: "monthly", [MONOTRIBUTO_KIND]: "fixed-fee", [MEI_KIND]: "fixed-fee", [SIMPLE_KIND]: "advance" };

export function diagnose({ answers, rules, today, spot }: { answers: Ready; rules: readonly TaxRule[]; today: PlainDate; spot?: string }): Diagnosis {
  const income = BigInt(answers.monthlyIncomeUsd) * 1_000_000n;
  const goal = BigInt(answers.salaryGoalUsd) * 1_000_000n;
  const dailySpend = goal / 30n;
  const emergencyTarget = goal * BigInt(answers.emergencyMonths);

  const eligibilityRegime = ELIGIBILITY_REGIME[answers.country];
  const eligibility: Diagnosis["eligibility"] = eligibilityRegime
    ? checkEligibility(rules, { country: answers.country, regime: eligibilityRegime, collectionMethod: answers.collection })
    : { status: "not-applicable" };

  const needsRate = answers.regime === "coded" && CURRENCY[answers.country] !== undefined;
  const regime = needsRate && spot ? regimeFor(answers, monthlyLocalMinor(income, spot), today, eligibility.status === "ok", rules) : undefined;
  const reserve = reserveFor(rules, { country: answers.country, today, yearToDate: income, lastYear: { income: 0n, tax: 0n }, regime });

  let rateBps: number;
  let basis: RateBasis = "flat";
  if (reserve.origin === "rule") {
    basis = BASIS[regime?.kind ?? ""] ?? "monthly";
    let reserveUsd = usdUnitsFromLocalMinor(reserve.amount, spot as string);
    rateBps = Math.min(10_000, Number(mulDiv(reserveUsd, 10_000n, income, "ceil")));
    // Under the advance threshold the SIMPLE regime asks for no bimonthly advance, but the annual tax is still owed: reserve its rate.
    if (regime?.kind === SIMPLE_KIND && reserve.amount === 0n) {
      const rule = currentRule(rules, "CO", SIMPLE_KIND, today);
      const estimate = rule ? estimateSimple(rule, regime.input) : undefined;
      if (estimate?.status === "ok") {
        rateBps = estimate.rateBps;
        basis = "annual";
        reserveUsd = mulDiv(income, BigInt(rateBps), 10_000n, "ceil");
      }
    }
  } else {
    rateBps = Math.min(10_000, Number(mulDiv(reserve.amount, 10_000n, income, "ceil")));
  }

  const tax: TaxBasis = {
    rateBps,
    origin: reserve.origin,
    ruleId: reserve.ruleId,
    regime: reserve.origin === "rule" ? reserve.regime : "fallback",
    verified: reserve.verification.status === "verified",
    sourceUrl: reserve.source.url,
    basis,
    fallback: reserve.origin === "fallback" ? fallbackCode(reserve.reason, answers, needsRate && !spot) : undefined,
    fx: regime ? "used" : needsRate ? "unavailable" : "not-needed",
  };

  const common = { income, payments: answers.paymentsPerMonth, rateBps, goal, dailySpend, emergencyTarget };
  const month = previewMonth(common);
  return { tax, rateBps, month, dailySpend, emergencyTarget, firstMonthReserve: mulDiv(income, BigInt(rateBps), 10_000n, "ceil"), eligibility };
}

function previewMonth(args: { income: bigint; payments: number; rateBps: number; goal: bigint; dailySpend: bigint; emergencyTarget: bigint }): MonthPlan {
  const zero = () => Object.fromEntries(BOX_KINDS.map((box) => [box, 0n])) as Record<BoxKind, bigint>;
  const byBox = zero();
  let firstPayment = zero();
  let operating = 0n;
  let emergency = 0n;
  let salaryOwed = args.goal;
  const each = args.income / BigInt(args.payments);
  for (let index = 0; index < args.payments; index++) {
    const amount = index === args.payments - 1 ? args.income - each * BigInt(args.payments - 1) : each;
    const result = allocatePayment(money("USDC", amount), {
      asset: "USDC", taxRateBps: args.rateBps, taxBufferBps: 10_500, payrollDue: 0n, payrollFunded: 0n, dailySpend: args.dailySpend,
      operatingBalance: operating, salaryOwed, emergencyTarget: args.emergencyTarget, emergencyBalance: emergency,
    });
    const split = Object.fromEntries(BOX_KINDS.map((box) => [box, result.byBox[box].units])) as Record<BoxKind, bigint>;
    if (index === 0) firstPayment = split;
    for (const box of BOX_KINDS) byBox[box] += split[box];
    operating += split.operating;
    emergency += split.emergency;
    salaryOwed = result.salaryPending.units;
  }
  return { byBox, salaryPending: salaryOwed, firstPayment };
}

const REGIME_KIND: Partial<Record<Country, string>> = { MX: RESICO_KIND, AR: MONOTRIBUTO_KIND, CO: SIMPLE_KIND, BR: MEI_KIND };

/** The short display name of each coded country's current regime, as its rule file names it (the part before the first comma). */
export function regimeNames(rules: readonly TaxRule[], today: PlainDate): Partial<Record<Country, string>> {
  const names: Partial<Record<Country, string>> = {};
  for (const [country, kind] of Object.entries(REGIME_KIND) as [Country, string][]) {
    const rule = currentRule(rules, country, kind, today);
    if (rule) names[country] = rule.regime.split(",")[0]?.trim();
  }
  return names;
}

let cached: TaxRule[] | undefined;
export function loadAppRules(): TaxRule[] {
  cached ??= loadRules(join(process.cwd(), "../../packages/tax-engine/rules"));
  return cached;
}

export async function latestSpot(country: Country, timeoutMs = 4_000): Promise<string | undefined> {
  const currency = CURRENCY[country];
  if (!currency) return undefined;
  try {
    const sources = loadFxSources(join(process.cwd(), "../../packages/tax-engine/fx/sources.json"));
    const source = sources[currency];
    if (!source) return undefined;
    const from = new Date(Date.now() - 14 * 86_400_000).toISOString().slice(0, 10);
    const series = await Promise.race([fetchSeries(source, from, currency), new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timeout")), timeoutMs))]);
    const last = series.at(-1);
    return last ? last.rate.toFixed(6) : undefined;
  } catch {
    return undefined;
  }
}
