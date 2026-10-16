import { describe, expect, it } from "vitest";
import { decisionSeen } from "../src/agent/confirm.ts";
import type { OpenedNotice } from "../src/activity/timeline.ts";

const notice = (id: bigint, value: OpenedNotice["notice"]): OpenedNotice => ({ id, timestamp: 1, txHash: `0x${"00".repeat(32)}`, notice: value });

describe("decisionSeen", () => {
  it("is true only for the decision of that proposal with that status", () => {
    const notices = [notice(1n, { kind: "decision", proposalId: "p-1", status: "executed" }), notice(2n, { kind: "decision", proposalId: "p-2", status: "rejected" })];
    expect(decisionSeen({ notices, proposalId: "p-1", status: "executed" })).toBe(true);
    expect(decisionSeen({ notices, proposalId: "p-1", status: "rejected" })).toBe(false);
    expect(decisionSeen({ notices, proposalId: "p-3", status: "executed" })).toBe(false);
  });

  it("ignores unreadable notices and never takes a salary notice for a decision", () => {
    expect(decisionSeen({ notices: [notice(1n, null)], proposalId: "p-1", status: "executed" })).toBe(false);
    expect(decisionSeen({ notices: [notice(1n, { kind: "salary", month: "2026-11", paid: "1", pending: "0" })], proposalId: "p-1", status: "executed" })).toBe(false);
  });
});
