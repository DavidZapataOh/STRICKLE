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

const ME = "0x00000000000000000000000000000000000000a1";
const ctx = { now: NOW, today, books: books() }; // the helpers this file already defines

describe("expect", () => {
  it("adds a declaration that expires, and learns the sender address as the user's own", () => {
    const result = applyAction(base, { kind: "expect", id: "e1", asset: "USDC", min: "490000000", max: "500000000", expiresInSeconds: 3600, from: ME }, ctx);
    if (!result.ok) throw new Error(result.reason);
    expect(result.next.flow.expect).toEqual([{ id: "e1", asset: "USDC", min: "490000000", max: "500000000", expiresAt: ctx.now + 3600 }]);
    expect(result.next.flow.owners).toEqual([ME]);
  });
  it("refuses an inverted window, a duplicate id and a fifth pending declaration, after pruning the expired ones", () => {
    const declare = (profile: Profile, id: string, min = "1", max = "2") => applyAction(profile, { kind: "expect", id, asset: "USDC", min, max, expiresInSeconds: 3600 }, ctx);
    expect(declare(base, "e1", "5", "4").ok).toBe(false);
    const one = declare(base, "e1");
    if (!one.ok) throw new Error(one.reason);
    expect(declare(one.next, "e1").ok).toBe(false);
    let full = one.next;
    for (const id of ["e2", "e3", "e4"]) {
      const next = declare(full, id);
      if (!next.ok) throw new Error(next.reason);
      full = next.next;
    }
    expect(declare(full, "e5").ok).toBe(false);
    const expired = { ...full, flow: { ...full.flow, expect: full.flow.expect.map((entry, index) => (index === 0 ? { ...entry, expiresAt: ctx.now - 1 } : entry)) } };
    expect(declare(expired, "e5").ok).toBe(true);
  });
});

describe("reclassify", () => {
  const taxed = { ...base, taxRateBps: 2_000 }; // the file's base profile has no tax rate, and the catch-up needs one
  const withIncome = { ...taxed, history: [["2026-11-03", "500000000", "deposit"] as [string, string, string]], arrivals: [["a1b2c3d4e5-0", "2026-11-03", "500000000", "i", "U"] as [string, string, string, string, string]] };
  it("takes a payment out of the income history without touching the boxes", () => {
    const result = applyAction(withIncome, { kind: "reclassify", arrivalId: "a1b2c3d4e5-0", to: "own-transfer" }, ctx);
    if (!result.ok) throw new Error(result.reason);
    expect(result.next.history[0]?.[2]).toBe("transfer");
    expect(result.next.arrivals[0]?.[3]).toBe("O");
    expect(result.pay).toBeUndefined();
    expect(result.notices).toEqual([{ kind: "reclassified", arrivalId: "a1b2c3d4e5-0", amount: "500000000", from: "income", to: "own-transfer" }]);
  });
  it("puts it back, and then the profile is what it was (the correction is exactly reversible)", () => {
    const away = applyAction(withIncome, { kind: "reclassify", arrivalId: "a1b2c3d4e5-0", to: "own-transfer" }, ctx);
    if (!away.ok) throw new Error(away.reason);
    const back = applyAction(away.next, { kind: "reclassify", arrivalId: "a1b2c3d4e5-0", to: "income" }, ctx);
    if (!back.ok) throw new Error(back.reason);
    expect(back.next).toEqual(withIncome);
  });
  it("does not ask for the tax again however many times a correction is toggled", () => {
    let profile = withIncome;
    for (const to of ["own-transfer", "income", "own-transfer", "income"] as const) {
      const step = applyAction(profile, { kind: "reclassify", arrivalId: "a1b2c3d4e5-0", to }, ctx);
      if (!step.ok) throw new Error(step.reason);
      profile = step.next;
    }
    expect(profile).toEqual(withIncome);
  });
  it("accepts the id of an arrival that was split into ten or more parts", () => {
    const wide = { ...withIncome, arrivals: [["a1b2c3d4e5-10", "2026-11-03", "500000000", "i", "U"] as [string, string, string, string, string]] };
    const result = applyAction(wide, { kind: "reclassify", arrivalId: "a1b2c3d4e5-10", to: "refund" }, ctx);
    expect(result.ok).toBe(true);
  });
  it("asks the next income to set aside the tax it missed, once", () => {
    const own = { ...withIncome, history: [["2026-11-03", "500000000", "transfer"] as [string, string, string]], arrivals: [["a1b2c3d4e5-0", "2026-11-03", "500000000", "o", "U"] as [string, string, string, string, string]] };
    const result = applyAction(own, { kind: "reclassify", arrivalId: "a1b2c3d4e5-0", to: "income" }, ctx);
    if (!result.ok) throw new Error(result.reason);
    expect(result.next.taxCatchUp).toBe("105000000"); // 500 x 20% x 1.05
  });
  it("ignores an arrival it does not know and a class it is already in", () => {
    expect(applyAction(withIncome, { kind: "reclassify", arrivalId: "ffffffffff-0", to: "refund" }, ctx).ok).toBe(false);
    const same = applyAction(withIncome, { kind: "reclassify", arrivalId: "a1b2c3d4e5-0", to: "income" }, ctx);
    expect(same.ok && same.notices).toEqual([]);
  });
  it("learns the sender only when the class becomes own money", () => {
    const own = applyAction(withIncome, { kind: "reclassify", arrivalId: "a1b2c3d4e5-0", to: "own-transfer", learn: ME }, ctx);
    if (!own.ok) throw new Error(own.reason);
    expect(own.next.flow.owners).toEqual([ME]);
    const refund = applyAction(withIncome, { kind: "reclassify", arrivalId: "a1b2c3d4e5-0", to: "refund", learn: ME }, ctx);
    if (!refund.ok) throw new Error(refund.reason);
    expect(refund.next.flow.owners).toEqual([]);
  });
});


describe("outflows are remembered, so money that comes back is recognised", () => {
  const approve = { kind: "approve" as const, proposalId: pending.id, digest };
  it("records the salary the owner approved as money sent to their own payee", () => {
    const result = run(approve);
    if (!result.ok) throw new Error(result.reason);
    expect(result.next.flow.sent).toEqual([[payee, "U", "1000000", "2026-11-01", "o"]]);
  });
  it("records a payment to anyone else as a payee payment", () => {
    const other = "0x00000000000000000000000000000000000000c3";
    const elsewhere = { ...base, salary: { ...base.salary, payee: other }, proposals: [pending] };
    const result = run(approve, elsewhere);
    if (!result.ok) throw new Error(result.reason);
    expect(result.next.flow.sent[0]?.[4]).toBe("p");
  });
  it("keeps the newest twelve and drops anything older than 180 days on the next write", () => {
    const crowded = { ...base, flow: { ...base.flow, sent: Array.from({ length: 12 }, (_, i) => [payee, "U", String(i + 1), "2026-10-20", "o"] as [string, string, string, string, string]) } };
    const result = run(approve, crowded);
    if (!result.ok) throw new Error(result.reason);
    expect(result.next.flow.sent).toHaveLength(12);
    expect(result.next.flow.sent.at(-1)?.[2]).toBe("1000000");
    expect(result.next.flow.sent[0]?.[2]).toBe("2");
    const stale = { ...base, flow: { ...base.flow, sent: [[payee, "U", "5", "2026-04-01", "o"] as [string, string, string, string, string]] } };
    const after = run(approve, stale);
    if (!after.ok) throw new Error(after.reason);
    expect(after.next.flow.sent.map((entry) => entry[2])).toEqual(["1000000"]);
  });
});
