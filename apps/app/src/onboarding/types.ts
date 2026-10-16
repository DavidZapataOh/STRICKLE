export const COUNTRIES = ["AR", "BR", "CO", "MX", "PH", "PK", "US", "IN", "NG", "OTHER"] as const;
export type Country = (typeof COUNTRIES)[number];
export type Collection = "stablecoin" | "bank";
export type Regime = "coded" | "other";
export type StepId = "profile" | "country" | "regime" | "income" | "history" | "review";
export type ErrorKey = "collection" | "country" | "regime" | "income" | "goal" | "payday" | "days" | "emergency";

export interface Answers {
  collection: Collection | null;
  country: Country | null;
  regime: Regime | null;
  monthlyIncomeUsd: number | null;
  salaryGoalUsd: number | null;
  payday: number;
  paymentsPerMonth: 1 | 2 | 3 | 4;
  paymentDays: number[];
  emergencyMonths: number;
}

export type Ready = Answers & { collection: Collection; country: Country; monthlyIncomeUsd: number; salaryGoalUsd: number };
