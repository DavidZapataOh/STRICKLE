import { type Answers, COUNTRIES, type Country, type ErrorKey, type Ready, type StepId } from "./types.ts";

export type { Answers, Collection, Country, ErrorKey, Ready, Regime, StepId } from "./types.ts";
export { COUNTRIES } from "./types.ts";

export const MIN_INCOME_USD = 100;
export const MAX_INCOME_USD = 1_000_000;

export const emptyAnswers: Answers = {
  collection: null,
  country: null,
  regime: null,
  monthlyIncomeUsd: null,
  salaryGoalUsd: null,
  payday: 1,
  paymentsPerMonth: 2,
  paymentDays: [5, 20],
  emergencyMonths: 3,
};

// Countries whose tax engine rule has a typed calculator and a live exchange-rate source.
export const CODED_REGIME_COUNTRIES: readonly Country[] = ["MX", "AR", "CO", "BR"];

export const usd = (dollars: number): bigint => {
  if (!Number.isInteger(dollars) || dollars < 0) throw new RangeError("whole dollars only");
  return BigInt(dollars) * 1_000_000n;
};

const single = (value: string | string[] | undefined): string | undefined => (typeof value === "string" ? value : undefined);
const wholeDollars = (value: string | undefined): number | undefined => {
  if (!value || !/^[0-9]{1,7}$/.test(value)) return undefined;
  const number = Number(value);
  return number >= 1 && number <= MAX_INCOME_USD ? number : undefined;
};

export function fromLandingQuery(search: Record<string, string | string[] | undefined>): Partial<Answers> {
  const out: Partial<Answers> = {};
  const amount = wholeDollars(single(search.amount));
  if (amount !== undefined && amount >= MIN_INCOME_USD) out.monthlyIncomeUsd = amount;
  const country = single(search.country);
  if (country && (COUNTRIES as readonly string[]).includes(country)) out.country = country as Country;
  const goal = wholeDollars(single(search.goal));
  if (goal !== undefined) out.salaryGoalUsd = goal;
  return out;
}

/** `?mode=login` opens the flow on the account step for someone who already has an account. */
export function startMode(search: Record<string, string | string[] | undefined>): "register" | "login" {
  return single(search.mode) === "login" ? "login" : "register";
}

/** A stable text for a set of answers: a diagnosis computed for one fingerprint is never shown for another. */
export function fingerprint(answers: Answers): string {
  return [answers.collection, answers.country, answers.regime, answers.monthlyIncomeUsd, answers.salaryGoalUsd, answers.payday, answers.paymentsPerMonth, answers.paymentDays.join(","), answers.emergencyMonths].join("|");
}

export function stepsFor(answers: Answers): StepId[] {
  const steps: StepId[] = ["profile", "country"];
  if (answers.country && CODED_REGIME_COUNTRIES.includes(answers.country)) steps.push("regime");
  steps.push("income", "history", "review");
  return steps;
}

export function validate(step: StepId, answers: Answers): ErrorKey[] {
  switch (step) {
    case "profile":
      return answers.collection ? [] : ["collection"];
    case "country":
      return answers.country ? [] : ["country"];
    case "regime":
      return answers.regime ? [] : ["regime"];
    case "income": {
      const errors: ErrorKey[] = [];
      if (answers.monthlyIncomeUsd === null || answers.monthlyIncomeUsd < MIN_INCOME_USD || answers.monthlyIncomeUsd > MAX_INCOME_USD) errors.push("income");
      if (answers.salaryGoalUsd === null || answers.salaryGoalUsd < 1 || answers.salaryGoalUsd > MAX_INCOME_USD) errors.push("goal");
      if (!Number.isInteger(answers.payday) || answers.payday < 1 || answers.payday > 28) errors.push("payday");
      return errors;
    }
    case "history": {
      const days = answers.paymentDays;
      const valid = days.length === answers.paymentsPerMonth && days.every((day) => Number.isInteger(day) && day >= 1 && day <= 28) && new Set(days).size === days.length;
      return valid ? [] : ["days"];
    }
    case "review":
      return Number.isInteger(answers.emergencyMonths) && answers.emergencyMonths >= 1 && answers.emergencyMonths <= 12 ? [] : ["emergency"];
  }
}

export function ready(answers: Answers): Ready | null {
  if (!answers.collection || !answers.country || answers.monthlyIncomeUsd === null || answers.salaryGoalUsd === null) return null;
  return answers as Ready;
}
