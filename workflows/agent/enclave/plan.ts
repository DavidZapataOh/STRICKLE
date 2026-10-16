import { decideSalary, forecast } from "@strickle/brain";
import { type PlainDate, addMonths, formatPlainDate, plainDate } from "@strickle/core";
import type { Address } from "viem";
import { historyOf, historyWeeksOf, isObserved, seedOf } from "./history.ts";
import type { PlanNotice } from "./notice-schema.ts";
import type { Profile } from "./profile.ts";
import type { TickBooks } from "./tick.ts";

const MAX_DAYS = 36_500;
const MAX_FORECAST_WEEKS = 26;
const ORDER = { salary: 0, payroll: 1, tax: 2 } as const;

const monthKey = (date: PlainDate) => `${date.year}-${String(date.month).padStart(2, "0")}`;

export function nextSalaryDate(today: PlainDate, day: number, lastPaid: string): PlainDate {
  const thisMonth = plainDate(today.year, today.month, day);
  const ahead = formatPlainDate(thisMonth) >= formatPlainDate(today);
  if (ahead && lastPaid !== monthKey(thisMonth)) return thisMonth;
  const next = addMonths(plainDate(today.year, today.month, 1), 1);
  return plainDate(next.year, next.month, day);
}

export function cushionDays(books: TickBooks, dailySpend: bigint): number | null {
  if (dailySpend <= 0n) return null;
  const days = (books.boxes.operating + books.boxes.emergency) / dailySpend;
  return Number(days > BigInt(MAX_DAYS) ? BigInt(MAX_DAYS) : days);
}

export function buildPlanNotice({ profile, books, today, vault, nowSeconds }: { profile: Profile; books: TickBooks; today: PlainDate; vault: Address; nowSeconds: number }): PlanNotice {
  const dailySpend = BigInt(profile.dailySpend);
  const floorDays = Math.max(1, profile.floorDays);
  const proposed = BigInt(profile.salary.proposed);
  const pending = BigInt(profile.salary.pending);
  const salaryBox = books.boxes.salary;
  const buffer = books.boxes.operating + salaryBox;
  const history = historyOf(profile);
  const outlook = forecast({ asset: "USDC", asOf: today, openingBalance: buffer, history, seed: seedOf(vault, today) });
  const decision = decideSalary({
    proposed, pending, salaryBoxBalance: salaryBox, bufferBalance: buffer, taxesFunded: books.boxes.taxes, taxesDue: BigInt(profile.taxesDue),
    dailySpend, historyWeeks: historyWeeksOf(history, today), forecast: outlook, policy: { floorDays },
  });
  const payable = decision.safeMax < decision.owed ? decision.safeMax : decision.owed;

  const next = nextSalaryDate(today, profile.salary.day, profile.salary.lastPaid);
  const from = formatPlainDate(today);
  const until = formatPlainDate(addMonths(today, 3));
  const events = [
    { date: formatPlainDate(next), kind: "salary" as const, amount: String(proposed + pending) },
    { date: formatPlainDate(addMonths(next, 1)), kind: "salary" as const, amount: String(proposed) },
    ...profile.payrolls.map(([date, amount]) => ({ date, kind: "payroll" as const, amount })),
    ...profile.taxDates.map((date) => ({ date, kind: "tax" as const, amount: null })),
  ]
    .filter((event) => event.date >= from && event.date <= until)
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : ORDER[a.kind] - ORDER[b.kind]))
    .slice(0, 8);

  const weeks = Math.min(outlook.weeks, MAX_FORECAST_WEEKS);
  return {
    kind: "plan",
    asOf: from,
    salary: {
      next: formatPlainDate(next),
      owed: String(decision.owed),
      safeNow: String(decision.safeMax),
      pending: String(decision.pending),
      binding: decision.binding,
      aboveFloorBps: 10_000 - decision.breachBps,
      lastPaid: profile.salary.lastPaid,
      needsApproval: payable > BigInt(profile.limits.signatureThreshold),
      halted: profile.breaker.halted,
    },
    proposals: profile.proposals
      .filter((proposal) => proposal.status === "pending" && proposal.expiresAt > nowSeconds)
      .slice(-4)
      .map((proposal) => ({ id: proposal.id, amount: proposal.amount, expiresAt: proposal.expiresAt })),
    cushion: { days: cushionDays(books, dailySpend), floorDays: profile.floorDays, targetDays: profile.targetDays },
    forecast: {
      floor: String(BigInt(floorDays) * dailySpend),
      opening: String(buffer),
      p10: outlook.p10.slice(0, weeks).map(String),
      p50: outlook.p50.slice(0, weeks).map(String),
      basis: isObserved(history) ? "observed" : "estimate",
    },
    events,
    targets: { taxes: profile.taxesDue, payroll: profile.payrollDue, salary: profile.salary.proposed, operating: String(BigInt(profile.targetDays) * dailySpend), emergency: profile.emergencyTarget },
    rates: { taxBps: profile.taxRateBps },
  };
}
