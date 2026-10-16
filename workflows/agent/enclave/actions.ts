// workflows/agent/enclave/actions.ts
import { cascadeSalaryOwed, decide, execute, guard, validateParameterProposal } from "@strickle/brain";
import { type PlainDate, formatPlainDate } from "@strickle/core";
import type { Address } from "viem";
import type { Notice } from "./notices.ts";
import type { Profile } from "./profile.ts";
import { fromBrain, toBrain } from "./proposals.ts";
import type { Action } from "./signed.ts";
import { type TickBooks, invariantPolicy, snapshotOf } from "./tick.ts";

export type ApplyResult =
  | { ok: true; next: Profile; pay?: { payee: Address; amount: bigint; seen: bigint }; notices: Notice[] }
  | { ok: false; reason: string };

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
      const next = refreshOwed({ ...profile, proposals, salary: { ...profile.salary, pending: String(pending) } }, salaryBox - amount);
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
