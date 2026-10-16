import type { PlanNotice } from "@strickle/agent/notice-schema";
import { formatPercent } from "@strickle/design/format";
import type { Locale } from "@strickle/design/locale";
import type { DataText } from "@/i18n/slices";
import { fill } from "@/i18n/fill";

export interface EventRow {
  kind: "salary" | "payroll" | "tax";
  title: string;
  rule: string;
  date: string;
  amount: bigint | null;
  reserved: bigint | null;
}

export function eventRows(plan: PlanNotice, taxesReserved: bigint, lang: Locale, t: DataText): EventRow[] {
  let firstTax = true;
  return plan.events.map((event) => {
    const rule = event.kind === "salary" ? t.home.events.ruleSalary : event.kind === "payroll" ? t.home.events.rulePayroll : fill(t.home.events.ruleTax, { rate: formatPercent(plan.rates.taxBps, lang) });
    const reserved = event.kind === "tax" && firstTax ? taxesReserved : null;
    if (event.kind === "tax") firstTax = false;
    return { kind: event.kind, title: t.home.events[event.kind], rule, date: event.date, amount: event.amount === null ? null : BigInt(event.amount), reserved };
  });
}
