// workflows/agent/enclave/actions.ts
import { cascadeSalaryOwed, decide, execute, guard, validateParameterProposal } from "@strickle/brain";
import { type PlainDate, formatPlainDate } from "@strickle/core";
import type { Address } from "viem";
import { appendSent } from "./flow.ts";
import type { Notice } from "./notices.ts";
import type { Profile } from "./profile.ts";
import { fromBrain, toBrain } from "./proposals.ts";
import type { Action } from "./signed.ts";
import { type TickBooks, invariantPolicy, snapshotOf } from "./tick.ts";

export type ApplyResult =
  | { ok: true; next: Profile; pay?: { payee: Address; amount: bigint; seen: bigint }; notices: Notice[] }
  | { ok: false; reason: string };

const MAX_DECLARED = 10n ** 15n;
const MAX_EXPECTATIONS = 4;
const MAX_OWNERS = 8;
const CLASS_CODE = { income: "i", "own-transfer": "o", refund: "r" } as const;
const CLASS_OF = { i: "income", o: "own-transfer", r: "refund" } as const;
const HISTORY_SOURCE = { income: "deposit", "own-transfer": "transfer", refund: "refund" } as const;
const withOwner = (owners: string[], address: string): string[] => (owners.some((owner) => owner.toLowerCase() === address.toLowerCase()) || owners.length >= MAX_OWNERS ? owners : [...owners, address]);
const ceilTax = (amount: bigint, rate: number, buffer: number, cap: bigint): bigint => {
  const tax = (amount * BigInt(rate) * BigInt(buffer) + 99_999_999n) / 100_000_000n;
  return tax < cap ? tax : cap;
};
const fail = (reason: string): ApplyResult => ({ ok: false, reason });
const refreshOwed = (profile: Profile, salaryBox: bigint): Profile => ({
  ...profile,
  salaryOwed: String(cascadeSalaryOwed(BigInt(profile.salary.proposed) + BigInt(profile.salary.pending), salaryBox)),
});

export function applyAction(profile: Profile, action: Action, context: { now: number; today: PlainDate; books: TickBooks }): ApplyResult {
  const { now, today, books } = context;
  const day = formatPlainDate(today);
  const salaryBox = books.boxes.salary;

  switch (action.kind) {
    case "pause": {
      // A halt raised by an invariant stays what it is: pausing on top of it must not make it look like the user's own pause.
      if (profile.breaker.halted) return fail("already-halted");
      return { ok: true, next: { ...profile, breaker: { halted: true, since: day, codes: ["user-pause"] } }, notices: [] };
    }
    case "resume": {
      if (!profile.breaker.halted) return fail("not-paused");
      if (profile.breaker.codes.length !== 1 || profile.breaker.codes[0] !== "user-pause") return fail("halted-by-invariants");
      return { ok: true, next: { ...profile, breaker: { halted: false, since: "", codes: [] } }, notices: [] };
    }
    case "reject": {
      const index = profile.proposals.findIndex((proposal) => proposal.id === action.proposalId);
      if (index < 0) return fail("unknown-proposal");
      const stored = profile.proposals[index];
      const decided = decide(toBrain(stored), "reject", now);
      if ("error" in decided) return fail(decided.error);
      const proposals = profile.proposals.map((proposal, at) => (at === index ? fromBrain(decided.proposal, stored) : proposal));
      return { ok: true, next: { ...profile, proposals }, notices: [{ kind: "decision", proposalId: stored.id, status: "rejected" }] };
    }
    case "approve": {
      if (profile.breaker.halted) return fail("halted");
      const index = profile.proposals.findIndex((proposal) => proposal.id === action.proposalId);
      if (index < 0) return fail("unknown-proposal");
      const stored = profile.proposals[index];
      if (stored.digest !== action.digest) return fail("digest-mismatch");
      const amount = BigInt(stored.amount);
      if (amount > salaryBox) return fail("salary-box-short");
      const verdict = guard({ status: "running" }, snapshotOf(profile, books, today), { kind: "salary", amount, signed: true }, invariantPolicy(profile));
      if (!verdict.allow) return fail("invariant");
      const decided = decide(toBrain(stored), "approve", now);
      if ("error" in decided) return fail(decided.error);
      const executed = execute(decided.proposal, stored.digest, now);
      if ("error" in executed) return fail(executed.error);
      const proposals = profile.proposals.map((proposal, at) => (at === index ? fromBrain(executed.proposal, stored) : proposal));
      const pending = BigInt(profile.salary.pending) > amount ? BigInt(profile.salary.pending) - amount : 0n;
      const paidTo = stored.payee.toLowerCase() === profile.salary.payee.toLowerCase() ? "o" : "p";
      const next = refreshOwed({ ...profile, proposals, salary: { ...profile.salary, pending: String(pending) }, flow: { ...profile.flow, sent: appendSent(profile, { payee: stored.payee, amount, date: today, kind: paidTo }) } }, salaryBox - amount);
      return {
        ok: true,
        next,
        pay: { payee: stored.payee as Address, amount, seen: salaryBox },
        notices: [
          { kind: "decision", proposalId: stored.id, status: "executed" },
          { kind: "salary", month: day.slice(0, 7), paid: String(amount), pending: String(pending) },
        ],
      };
    }
    case "pay":
      return fail("not-applicable");
    case "expect": {
      const live = profile.flow.expect.filter((entry) => entry.expiresAt > now);
      if (BigInt(action.min) > BigInt(action.max)) return fail("inverted-window");
      if (BigInt(action.max) > MAX_DECLARED) return fail("amount-too-large");
      if (live.some((entry) => entry.id === action.id)) return fail("duplicate-id");
      if (live.length >= MAX_EXPECTATIONS) return fail("too-many-declarations");
      const owners = action.from === undefined ? profile.flow.owners : withOwner(profile.flow.owners, action.from);
      const expect = [...live, { id: action.id, asset: action.asset, min: action.min, max: action.max, expiresAt: now + action.expiresInSeconds }];
      return { ok: true, next: { ...profile, flow: { ...profile.flow, expect, owners } }, notices: [] };
    }
    case "reclassify": {
      const id = profile.arrivals.some((entry) => entry[0] === action.arrivalId) ? action.arrivalId : `${action.arrivalId}-0`;
      const index = profile.arrivals.findIndex((entry) => entry[0] === id);
      if (index < 0) return fail("unknown-arrival");
      const entry = profile.arrivals[index];
      const [, date, amount, code, assetCode] = entry;
      const from = CLASS_OF[code];
      if (from === action.to) return { ok: true, next: profile, notices: [] };
      const arrivals = profile.arrivals.map((candidate, at) => (at === index ? ([candidate[0], date, amount, CLASS_CODE[action.to], assetCode] as typeof entry) : candidate));
      // the history entry that recorded this part is relabelled, so the forecast and the weeks of history follow the correction; the last match is the most recent one
      const wanted = HISTORY_SOURCE[from];
      const at = profile.history.map(([d, a, s]) => d === date && a === amount && s === wanted).lastIndexOf(true);
      const history = at < 0 ? profile.history : profile.history.map((row, position) => (position === at ? ([row[0], row[1], HISTORY_SOURCE[action.to]] as typeof row) : row));
      // a payment that turns out to be income owes the taxes it skipped: the next income sets them aside, nothing is taken from boxes now
      const owed = from !== "income" && action.to === "income" ? ceilTax(BigInt(amount), profile.taxRateBps, profile.taxBufferBps, BigInt(amount)) : 0n;
      const owners = action.learn !== undefined && action.to === "own-transfer" ? withOwner(profile.flow.owners, action.learn) : profile.flow.owners;
      const next: Profile = { ...profile, arrivals, history, taxCatchUp: (BigInt(profile.taxCatchUp) + owed).toString(), flow: { ...profile.flow, owners } };
      return { ok: true, next, notices: [{ kind: "reclassified", arrivalId: entry[0], amount, from, to: action.to }] };
    }
    case "adjust": {
      const { changes } = action;
      let next = { ...profile };
      if (changes.salaryProposed !== undefined || changes.salaryDay !== undefined || changes.payee !== undefined) {
        next = {
          ...next,
          salary: {
            ...next.salary,
            ...(changes.salaryProposed !== undefined ? { proposed: changes.salaryProposed } : {}),
            ...(changes.salaryDay !== undefined ? { day: changes.salaryDay } : {}),
            ...(changes.payee !== undefined ? { payee: changes.payee } : {}),
          },
        };
      }
      if (changes.dailyCap !== undefined || changes.signatureThreshold !== undefined) {
        next = { ...next, limits: { dailyCap: changes.dailyCap ?? next.limits.dailyCap, signatureThreshold: changes.signatureThreshold ?? next.limits.signatureThreshold } };
      }
      for (const name of ["floorDays", "targetDays"] as const) {
        const requested = changes[name];
        if (requested === undefined) continue;
        const change = validateParameterProposal(name, requested, { floorDays: next.floorDays, targetDays: next.targetDays });
        if (change.status === "rejected" || change.applied === null) return fail("rejected-parameter");
        next = { ...next, [name]: change.applied };
      }
      return { ok: true, next: refreshOwed(next, salaryBox), notices: [] };
    }
  }
}
