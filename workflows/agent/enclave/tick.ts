// workflows/agent/enclave/tick.ts
import { type CashEntry, type InvariantPolicy, PROPOSAL_TTL_SECONDS, type Snapshot, cascadeSalaryOwed, decideSalary, forecast, guard } from "@strickle/brain";
import { BOX_KINDS, type BoxKind, type PlainDate, daysBetween, formatPlainDate, parsePlainDate, toEpochDay } from "@strickle/core";
import type { Address } from "viem";
import type { Notice } from "./notices.ts";
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

const seedOf = (vault: Address, today: PlainDate): number => (Number.parseInt(vault.slice(2, 10), 16) ^ toEpochDay(today)) >>> 0;
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

export function planTick(profile: Profile, books: TickBooks, today: PlainDate, vault: Address, nowSeconds: number): TickPlan {
  const day = formatPlainDate(today);
  if (profile.tick.lastDay === day) return { kind: "skip" };

  const month = day.slice(0, 7);
  const salaryBox = books.boxes.salary;
  const buffer = books.boxes.operating + salaryBox;
  const dailySpend = BigInt(profile.dailySpend);
  const history: CashEntry[] = profile.history.map(([date, amount, source]) => ({ date: parsePlainDate(date), amount: BigInt(amount), source }));
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
  if (!due || owed === 0n) return { kind: "tick", next: finish(BigInt(profile.salary.pending), 0n, profile.salary.lastPaid), notices: [] };

  const oldest = history.reduce<PlainDate | undefined>((first, entry) => (first === undefined || daysBetween(entry.date, first) > 0 ? entry.date : first), undefined);
  const decision = decideSalary({
    proposed,
    pending: BigInt(profile.salary.pending),
    salaryBoxBalance: salaryBox,
    bufferBalance: buffer,
    taxesFunded: books.boxes.taxes,
    taxesDue: BigInt(profile.taxesDue),
    dailySpend,
    historyWeeks: oldest === undefined ? 0 : Math.floor(daysBetween(oldest, today) / 7),
    forecast: outlook,
    policy: { floorDays: Math.max(1, profile.floorDays) },
  });

  if (decision.payNow > 0n && profile.salary.payee !== ZERO_ADDRESS) {
    const verdict = guard({ status: "running" }, snapshotOf(profile, books, today), { kind: "salary", amount: decision.payNow }, invariantPolicy(profile));
    if (verdict.allow) {
      return {
        kind: "salary",
        next: finish(decision.pending, decision.payNow, month),
        payee: profile.salary.payee as Address,
        amount: decision.payNow,
        seen: salaryBox,
        notices: [{ kind: "salary", month, paid: String(decision.payNow), pending: String(decision.pending) }],
      };
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
      return {
        kind: "tick",
        next: { ...finish(owed, 0n, month), proposals: [...profile.proposals, proposal] },
        notices: [{ kind: "proposal", proposalId: id, amount, payee: proposal.payee, digest: proposal.digest, expiresAt: proposal.expiresAt }],
      };
    }
  }
  return { kind: "tick", next: finish(owed, 0n, month), notices: [] };
}
