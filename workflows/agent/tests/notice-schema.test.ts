import { describe, expect, it } from "vitest";
import { noticeSchema, planNoticeSchema } from "../enclave/notice-schema.ts";

const plan = {
  kind: "plan" as const,
  asOf: "2026-11-01",
  salary: { next: "2026-12-01", owed: "1000000", safeNow: "1000000", pending: "0", binding: "full" as const, aboveFloorBps: 9900, lastPaid: "2026-11", needsApproval: false, halted: false },
  proposals: [],
  cushion: { days: 42, floorDays: 14, targetDays: 42 },
  forecast: { floor: "280000", opening: "4000000", p10: ["-5", "10"], p50: ["100", "200"], basis: "observed" as const },
  events: [{ date: "2026-12-01", kind: "salary" as const, amount: "1000000" }, { date: "2026-12-17", kind: "tax" as const, amount: null }],
  targets: { taxes: "0", payroll: "0", salary: "1000000", operating: "840000", emergency: "0" },
  rates: { taxBps: 1800 },
};

describe("planNoticeSchema", () => {
  it("accepts a complete plan, including negative forecast values, open proposals and an unknown cushion", () => {
    expect(planNoticeSchema.safeParse(plan).success).toBe(true);
    expect(planNoticeSchema.safeParse({ ...plan, cushion: { ...plan.cushion, days: null } }).success).toBe(true);
    expect(planNoticeSchema.safeParse({ ...plan, proposals: [{ id: "salary-2026-11", amount: "1", expiresAt: 1_800_000_000 }] }).success).toBe(true);
  });

  it.each([
    ["an extra field", { extra: 1 }],
    ["a basis point share above 100%", { salary: { ...plan.salary, aboveFloorBps: 10_001 } }],
    ["an unknown binding", { salary: { ...plan.salary, binding: "maybe" } }],
    ["a date that is not a date", { asOf: "1 Nov" }],
    ["nine events", { events: Array.from({ length: 9 }, () => plan.events[0]) }],
    ["five open proposals", { proposals: Array.from({ length: 5 }, () => ({ id: "a", amount: "1", expiresAt: 1 })) }],
    ["more than 26 forecast points", { forecast: { ...plan.forecast, p50: Array.from({ length: 27 }, () => "1") } }],
    ["an unknown forecast basis", { forecast: { ...plan.forecast, basis: "guess" } }],
    ["a negative amount where only units are allowed", { targets: { ...plan.targets, salary: "-1" } }],
  ])("refuses %s", (_name, patch) => {
    expect(planNoticeSchema.safeParse({ ...plan, ...patch }).success).toBe(false);
  });
});

describe("noticeSchema", () => {
  it("keeps the three older kinds exactly as they were", () => {
    expect(noticeSchema.safeParse({ kind: "salary", month: "2026-11", paid: "1", pending: "0" }).success).toBe(true);
    expect(noticeSchema.safeParse({ kind: "decision", proposalId: "salary-2026-11", status: "executed" }).success).toBe(true);
    expect(noticeSchema.safeParse({ kind: "proposal", proposalId: "salary-2026-11", amount: "1", payee: "0x00000000000000000000000000000000000000a1", digest: `0x${"ab".repeat(32)}`, expiresAt: 1_800_000_000 }).success).toBe(true);
    expect(noticeSchema.safeParse({ kind: "plan" }).success).toBe(false);
  });
});
