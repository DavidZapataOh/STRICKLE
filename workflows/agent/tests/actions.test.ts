// workflows/agent/tests/actions.test.ts
import { plainDate } from "@strickle/core";
import { describe, expect, it } from "vitest";
import { applyAction } from "../enclave/actions.ts";
import { type Profile, profileSchema } from "../enclave/profile.ts";
import { proposalDigest } from "../enclave/proposals.ts";

const today = plainDate(2026, 11, 1);
const NOW = Date.UTC(2026, 10, 1, 0, 5) / 1000;
const payee = "0x00000000000000000000000000000000000000b2";
const digest = proposalDigest({ payee, amount: "1000000", month: "2026-11" });
const pending = { id: "salary-2026-11", kind: "salary-day-one" as const, amount: "1000000", payee, digest, createdAt: NOW - 60, expiresAt: NOW + 604_800, status: "pending" as const, decidedAt: 0 };
const boxes = (salary = 1_000_000n) => ({ taxes: 0n, payroll: 0n, salary, operating: 3_000_000n, emergency: 0n, profit: 0n });
const zero = { taxes: 0n, payroll: 0n, salary: 0n, operating: 0n, emergency: 0n, profit: 0n };
const books = (salary = 1_000_000n) => ({ boxes: boxes(salary), invested: zero, unallocated: 0n });
const base: Profile = profileSchema.parse({
  version: 1, taxRateBps: 0, taxBufferBps: 10_500, payrollShareBps: 10_000, floorDays: 14, targetDays: 42,
  dailySpend: "20000", payrollDue: "0", salaryOwed: "1000000", emergencyTarget: "0",
  salary: { proposed: "1000000", pending: "1000000", payee, day: 1, lastPaid: "2026-11" },
  limits: { dailyCap: "100000000", signatureThreshold: "10" },
  proposals: [pending],
});
const run = (action: Parameters<typeof applyAction>[1], profile = base, salary = 1_000_000n) => applyAction(profile, action, { now: NOW, today, books: books(salary) });

describe("approve", () => {
  const approve = { kind: "approve" as const, proposalId: pending.id, digest };

  it("pays the proposal, consumes it and tells the user", () => {
    const result = run(approve);
    if (!result.ok) throw new Error(result.reason);
    expect(result.pay).toEqual({ payee, amount: 1_000_000n, seen: 1_000_000n });
    expect(result.next.proposals[0].status).toBe("executed");
    expect(result.next.salary.pending).toBe("0");
    expect(result.next.salaryOwed).toBe("1000000");
    expect(result.notices).toEqual([
      { kind: "decision", proposalId: pending.id, status: "executed" },
      { kind: "salary", month: "2026-11", paid: "1000000", pending: "0" },
    ]);
  });

  it("refuses a digest that is not the one the user saw", () => {
    expect(run({ ...approve, digest: `0x${"cd".repeat(32)}` })).toEqual({ ok: false, reason: "digest-mismatch" });
  });

  it("refuses an unknown, expired, decided or executed proposal", () => {
    expect(run({ ...approve, proposalId: "nope" })).toEqual({ ok: false, reason: "unknown-proposal" });
    expect(applyAction(base, approve, { now: pending.expiresAt + 1, today, books: books() })).toEqual({ ok: false, reason: "expired" });
    expect(run(approve, { ...base, proposals: [{ ...pending, status: "rejected", decidedAt: NOW }] })).toEqual({ ok: false, reason: "already-decided" });
    expect(run(approve, { ...base, proposals: [{ ...pending, status: "executed", decidedAt: NOW }] })).toEqual({ ok: false, reason: "already-decided" });
  });

  it("keeps the proposal pending when the salary box is short", () => {
    expect(run(approve, base, 400_000n)).toEqual({ ok: false, reason: "salary-box-short" });
  });

  it("pays nothing while the agent is paused or halted, however well signed", () => {
    expect(run(approve, { ...base, breaker: { halted: true, since: "2026-11-01", codes: ["user-pause"] } })).toEqual({ ok: false, reason: "halted" });
    expect(run(approve, { ...base, breaker: { halted: true, since: "2026-10-30", codes: ["books-balance"] } })).toEqual({ ok: false, reason: "halted" });
  });

  it("refuses when an invariant other than the signature would break", () => {
    expect(run(approve, { ...base, limits: { dailyCap: "0", signatureThreshold: "10" } })).toEqual({ ok: false, reason: "invariant" });
  });
});

describe("reject", () => {
  it("closes the proposal, moves no money and tells the user", () => {
    const result = run({ kind: "reject", proposalId: pending.id });
    if (!result.ok) throw new Error(result.reason);
    expect(result.pay).toBeUndefined();
    expect(result.next.proposals[0].status).toBe("rejected");
    expect(result.notices).toEqual([{ kind: "decision", proposalId: pending.id, status: "rejected" }]);
  });

  it("cannot reject twice", () => {
    expect(run({ kind: "reject", proposalId: pending.id }, { ...base, proposals: [{ ...pending, status: "rejected", decidedAt: NOW }] })).toEqual({ ok: false, reason: "already-decided" });
  });
});

describe("pause and resume", () => {
  it("pauses and resumes the user's own pause", () => {
    const paused = run({ kind: "pause" });
    if (!paused.ok) throw new Error(paused.reason);
    expect(paused.next.breaker).toEqual({ halted: true, since: "2026-11-01", codes: ["user-pause"] });
    const resumed = run({ kind: "resume" }, paused.next);
    if (!resumed.ok) throw new Error(resumed.reason);
    expect(resumed.next.breaker).toEqual({ halted: false, since: "", codes: [] });
  });

  it("cannot turn an invariant halt into a user pause that resume would lift", () => {
    const halted = { ...base, breaker: { halted: true, since: "2026-10-30", codes: ["books-balance"] } };
    expect(run({ kind: "pause" }, halted)).toEqual({ ok: false, reason: "already-halted" });
  });

  it("never lifts a halt raised by an invariant", () => {
    const halted = { ...base, breaker: { halted: true, since: "2026-10-30", codes: ["books-balance"] } };
    expect(run({ kind: "resume" }, halted)).toEqual({ ok: false, reason: "halted-by-invariants" });
  });

  it("refuses to resume what is not paused", () => {
    expect(run({ kind: "resume" })).toEqual({ ok: false, reason: "not-paused" });
  });
});

describe("adjust", () => {
  it("applies plain settings and refunds the cascade's view of next month's salary", () => {
    const result = run({ kind: "adjust", changes: { salaryProposed: "2000000", salaryDay: 5, payee: "0x00000000000000000000000000000000000000c3", dailyCap: "5", signatureThreshold: "6" } });
    if (!result.ok) throw new Error(result.reason);
    expect(result.next.salary).toMatchObject({ proposed: "2000000", day: 5, payee: "0x00000000000000000000000000000000000000c3" });
    expect(result.next.limits).toEqual({ dailyCap: "5", signatureThreshold: "6" });
    expect(result.next.salaryOwed).toBe("2000000");
  });

  it("clamps day parameters to the brain's ranges and rejects what it rejects", () => {
    const clamped = run({ kind: "adjust", changes: { floorDays: 3 } });
    if (!clamped.ok) throw new Error(clamped.reason);
    expect(clamped.next.floorDays).toBe(7);
    expect(run({ kind: "adjust", changes: { targetDays: 1.5 as number } })).toEqual({ ok: false, reason: "rejected-parameter" });
  });

  it("moves no money", () => {
    const result = run({ kind: "adjust", changes: { salaryDay: 9 } });
    expect(result.ok && result.pay).toBeFalsy();
  });
});
