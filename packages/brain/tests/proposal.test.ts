import { describe, expect, it } from "vitest";
import { PROPOSAL_TTL_SECONDS, type Proposal, createProposal, decide, execute, expireDue } from "../src/proposal.ts";

const action = { kind: "payment" as const, amount: 900n, digest: "abc123" };
const fresh = () => createProposal("p1", action, 1_000);

describe("createProposal", () => {
  it("is pending and expires in 7 days", () => {
    expect(PROPOSAL_TTL_SECONDS).toBe(604_800);
    expect(fresh()).toEqual({ id: "p1", action, createdAt: 1_000, expiresAt: 1_000 + 604_800, status: "pending" });
  });
  it("accepts a custom ttl and rejects an empty id or digest, a bad time or a non-positive ttl", () => {
    expect(createProposal("p", action, 0, 60).expiresAt).toBe(60);
    expect(() => createProposal("", action, 0)).toThrow(RangeError);
    expect(() => createProposal("p", { ...action, digest: "" }, 0)).toThrow(RangeError);
    expect(() => createProposal("p", action, -1)).toThrow(RangeError);
    expect(() => createProposal("p", action, 1.5)).toThrow(RangeError);
    expect(() => createProposal("p", action, 0, 0)).toThrow(RangeError);
  });
});

describe("decide", () => {
  it("approves or rejects a pending proposal before it expires", () => {
    expect(decide(fresh(), "approve", 2_000)).toEqual({ proposal: { ...fresh(), status: "approved", decidedAt: 2_000 } });
    expect(decide(fresh(), "reject", 2_000)).toEqual({ proposal: { ...fresh(), status: "rejected", decidedAt: 2_000 } });
  });
  it("is still open one second before expiry and expired exactly at it", () => {
    const p = fresh();
    expect(decide(p, "approve", p.expiresAt - 1)).toHaveProperty("proposal");
    expect(decide(p, "approve", p.expiresAt)).toEqual({ error: "expired" });
  });
  it("refuses to decide twice, to approve after a rejection, and after the proposal was marked expired, with distinct reasons", () => {
    const approved = (decide(fresh(), "approve", 2_000) as { proposal: Proposal }).proposal;
    const rejected = (decide(fresh(), "reject", 2_000) as { proposal: Proposal }).proposal;
    expect(decide(approved, "approve", 3_000)).toEqual({ error: "already-decided" });
    expect(decide(approved, "reject", 3_000)).toEqual({ error: "already-decided" });
    expect(decide(rejected, "approve", 3_000)).toEqual({ error: "already-decided" });
    const expired = expireDue(fresh(), 2_000_000);
    expect(decide(expired, "approve", 2_000_000)).toEqual({ error: "expired" });
  });
  it("never mutates its input", () => {
    const p = fresh();
    decide(p, "approve", 2_000);
    expect(p).toEqual(fresh());
  });
  it("rejects a non-integer or negative time", () => {
    expect(() => decide(fresh(), "approve", -1)).toThrow(RangeError);
    expect(() => decide(fresh(), "approve", 0.5)).toThrow(RangeError);
  });
});

describe("expireDue", () => {
  it("turns a stale pending proposal into expired and leaves decided ones alone", () => {
    expect(expireDue(fresh(), 1_000 + 604_800).status).toBe("expired");
    expect(expireDue(fresh(), 1_000 + 604_799).status).toBe("pending");
    const approved = (decide(fresh(), "approve", 2_000) as { proposal: Proposal }).proposal;
    expect(expireDue(approved, 9_999_999).status).toBe("approved");
  });
});

describe("execute", () => {
  const approved = () => (decide(fresh(), "approve", 2_000) as { proposal: Proposal }).proposal;
  it("executes an approved proposal once, for the exact action it was approved for", () => {
    const done = execute(approved(), "abc123", 3_000) as { proposal: Proposal };
    expect(done.proposal.status).toBe("executed");
    expect(execute(done.proposal, "abc123", 4_000)).toEqual({ error: "already-executed" });
  });
  it("an approval is good for 24 hours: executing at exactly the window's end is refused", () => {
    const p = approved(); // decided at 2,000
    expect(execute(p, "abc123", 2_000 + 86_399)).toHaveProperty("proposal");
    expect(execute(p, "abc123", 2_000 + 86_400)).toEqual({ error: "approval-expired" });
  });
  it("refuses a different action (digest mismatch) and anything not approved", () => {
    expect(execute(approved(), "different", 3_000)).toEqual({ error: "digest-mismatch" });
    expect(execute(fresh(), "abc123", 3_000)).toEqual({ error: "not-approved" });
    const rejected = (decide(fresh(), "reject", 2_000) as { proposal: Proposal }).proposal;
    expect(execute(rejected, "abc123", 3_000)).toEqual({ error: "not-approved" });
  });
});
