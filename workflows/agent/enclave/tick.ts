// workflows/agent/enclave/tick.ts
import { type InvariantPolicy, PROPOSAL_TTL_SECONDS, type Snapshot, cascadeSalaryOwed, decideSalary, forecast, guard } from "@strickle/brain";
import { appendSent } from "./flow.ts";
import { BOX_KINDS, type BoxKind, type PlainDate, formatPlainDate, parsePlainDate } from "@strickle/core";
import type { Address } from "viem";
import { historyOf, historyWeeksOf, seedOf } from "./history.ts";
import type { Notice } from "./notice-schema.ts";
import { buildPlanNotice } from "./plan.ts";
import { type Profile, ZERO_ADDRESS } from "./profile.ts";
import { proposalDigest } from "./proposals.ts";

export interface TickBooks {
  boxes: Record<BoxKind, bigint>;
  invested: Record<BoxKind, bigint>;
  unallocated: bigint;
}

export type TickPlan =
  | { kind: "skip" }
  | { kind: "tick"; next: Profile; notices: Notice[] }
  | { kind: "salary"; next: Profile; payee: Address; amount: bigint; seen: bigint; notices: Notice[] };

const sum = (record: Record<BoxKind, bigint>) => BOX_KINDS.reduce((total, kind) => total + record[kind], 0n);

export const invariantPolicy = (profile: Profile): InvariantPolicy => ({
  floorDays: Math.max(1, profile.floorDays),
  dailyCap: BigInt(profile.limits.dailyCap),
  signatureThreshold: BigInt(profile.limits.signatureThreshold),
});

export const snapshotOf = (profile: Profile, books: TickBooks, today: PlainDate): Snapshot => ({
  asOf: today,
  boxes: Object.fromEntries(BOX_KINDS.map((kind) => [kind, books.boxes[kind] + books.invested[kind]])) as Record<BoxKind, bigint>,
  unallocated: books.unallocated,
  liquid: sum(books.boxes) + books.unallocated,
  inVaults: sum(books.invested),
  taxesReserved: books.boxes.taxes,
  payrolls: profile.payrolls.map(([due, amount]) => ({ due: parsePlainDate(due), amount: BigInt(amount) })),
  dailySpend: BigInt(profile.dailySpend),
  outflowsToday: 0n,
});

type Ticked = Exclude<TickPlan, { kind: "skip" }>;

/** The day's plan notice is a convenience for the user's screen: if building it ever fails, the tick and the salary still go through without it. */
function withPlanNotice<T extends Ticked>(plan: T, books: TickBooks, paid: bigint, today: PlainDate, vault: Address, nowSeconds: number): T {
  try {
    const after = { ...books, boxes: { ...books.boxes, salary: books.boxes.salary - paid } };
    return { ...plan, notices: [...plan.notices, buildPlanNotice({ profile: plan.next, books: after, today, vault, nowSeconds })] };
  } catch {
    return plan;
  }
}

export function planTick(profile: Profile, books: TickBooks, today: PlainDate, vault: Address, nowSeconds: number): TickPlan {
  const conclude = <T extends Ticked>(plan: T, paid = 0n): T => withPlanNotice(plan, books, paid, today, vault, nowSeconds);
  const day = formatPlainDate(today);
  if (profile.tick.lastDay === day) return { kind: "skip" };

  const month = day.slice(0, 7);
  const salaryBox = books.boxes.salary;
  const buffer = books.boxes.operating + salaryBox;
  const dailySpend = BigInt(profile.dailySpend);
  const history = historyOf(profile);
  const outlook = forecast({ asset: "USDC", asOf: today, openingBalance: buffer, history, seed: seedOf(vault, today) });
  const last = outlook.weeks - 1;
  const refreshed = { lastDay: day, p10: String(outlook.p10[last]), p50: String(outlook.p50[last]) };

  const proposed = BigInt(profile.salary.proposed);
  const owed = proposed + BigInt(profile.salary.pending);
  const finish = (pending: bigint, paid: bigint, lastPaid: string): Profile => ({
    ...profile,
    salaryOwed: String(cascadeSalaryOwed(proposed + pending, salaryBox - paid)),
    salary: { ...profile.salary, pending: String(pending), lastPaid },
    tick: refreshed,
  });

  const due = today.day === profile.salary.day && profile.salary.lastPaid !== month && !profile.breaker.halted;
  if (!due || owed === 0n) return conclude({ kind: "tick", next: finish(BigInt(profile.salary.pending), 0n, profile.salary.lastPaid), notices: [] });

  const decision = decideSalary({
    proposed,
    pending: BigInt(profile.salary.pending),
    salaryBoxBalance: salaryBox,
    bufferBalance: buffer,
    taxesFunded: books.boxes.taxes,
    taxesDue: BigInt(profile.taxesDue),
    dailySpend,
    historyWeeks: historyWeeksOf(history, today),
    forecast: outlook,
    policy: { floorDays: Math.max(1, profile.floorDays) },
  });

  if (decision.payNow > 0n && profile.salary.payee !== ZERO_ADDRESS) {
    const verdict = guard({ status: "running" }, snapshotOf(profile, books, today), { kind: "salary", amount: decision.payNow }, invariantPolicy(profile));
    if (verdict.allow) {
      return conclude(
        {
          kind: "salary",
          next: { ...finish(decision.pending, decision.payNow, month), flow: { ...profile.flow, sent: appendSent(profile, { payee: profile.salary.payee, amount: decision.payNow, date: today, kind: "o" }) } },
          payee: profile.salary.payee as Address,
          amount: decision.payNow,
          seen: salaryBox,
          notices: [{ kind: "salary", month, paid: String(decision.payNow), pending: String(decision.pending) }],
        },
        decision.payNow,
      );
    }
    const onlyNeedsASignature = verdict.reason === "violations" && verdict.violations.every((violation) => violation.code === "signature-required");
    const id = `salary-${month}`;
    if (onlyNeedsASignature && !profile.proposals.some((proposal) => proposal.id === id)) {
      const amount = String(decision.payNow);
      const proposal = {
        id,
        kind: "salary-day-one" as const,
        amount,
        payee: profile.salary.payee,
        digest: proposalDigest({ payee: profile.salary.payee, amount, month }),
        createdAt: nowSeconds,
        expiresAt: nowSeconds + PROPOSAL_TTL_SECONDS,
        status: "pending" as const,
        decidedAt: 0,
      };
      return conclude({
        kind: "tick",
        next: { ...finish(owed, 0n, month), proposals: [...profile.proposals, proposal] },
        notices: [{ kind: "proposal", proposalId: id, amount, payee: proposal.payee, digest: proposal.digest, expiresAt: proposal.expiresAt }],
      });
    }
  }
  return conclude({ kind: "tick", next: finish(owed, 0n, month), notices: [] });
}
