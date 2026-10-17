import { describe, expect, it } from "vitest";
import { noticeSchema, planNoticeSchema } from "../enclave/notice-schema.ts";

const settings = { proposed: "1000000", day: 1, payee: "0x00000000000000000000000000000000000000b2", dailyCap: "100000000", signatureThreshold: "0", floorDays: 14, targetDays: 42, halted: false, haltCodes: [] as string[] };
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
  settings,
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
    ["no settings", { settings: undefined }],
    ["a salary day of 29", { settings: { ...settings, day: 29 } }],
    ["eight halt codes", { settings: { ...settings, haltCodes: Array(8).fill("c") } }],
    ["a negative cap", { settings: { ...settings, dailyCap: "-1" } }],
    ["an extra settings field", { settings: { ...settings, extra: 1 } }],
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

describe("the income notices", () => {
  const doubt = { kind: "income-doubt", arrivalId: "a1b2c3d4e5-0", asset: "USDC", amount: "500000000", flags: ["own-address"], sender: `0x${"1".repeat(40)}` };
  const corrected = { kind: "reclassified", arrivalId: "a1b2c3d4e5-0", amount: "500000000", from: "income", to: "own-transfer" };
  it("parse when well formed, with or without a sender on a doubt", () => {
    expect(noticeSchema.safeParse(doubt).success).toBe(true);
    expect(noticeSchema.safeParse({ ...doubt, flags: ["unattributed"], sender: "" }).success).toBe(true);
    expect(noticeSchema.safeParse(corrected).success).toBe(true);
  });
  it("refuse an unknown flag, an empty flag list, an extra key and a sender that is not an address", () => {
    expect(noticeSchema.safeParse({ ...doubt, flags: ["made-up"] }).success).toBe(false);
    expect(noticeSchema.safeParse({ ...doubt, flags: [] }).success).toBe(false);
    expect(noticeSchema.safeParse({ ...doubt, extra: 1 }).success).toBe(false);
    expect(noticeSchema.safeParse({ ...doubt, sender: "nope" }).success).toBe(false);
    expect(noticeSchema.safeParse({ ...corrected, to: "gift" }).success).toBe(false);
  });
});

describe("the conversion notices", () => {
  const swap = { kind: "swap", box: "payroll", from: "USDC", amountIn: "1000000000", estimatedOut: "890000000", minOut: "881000000", referenceOut: "889900000", deviationBps: 1, feeBps: 2 };
  const held = { kind: "swap-held", box: "operating", reason: "stale-feed" };
  it("parse when well formed", () => {
    expect(noticeSchema.safeParse(swap).success).toBe(true);
    expect(noticeSchema.safeParse(held).success).toBe(true);
    expect(noticeSchema.safeParse({ ...swap, deviationBps: -150 }).success).toBe(true);
  });
  it("refuse an unknown box, an unknown reason and an extra key", () => {
    expect(noticeSchema.safeParse({ ...swap, box: "vault" }).success).toBe(false);
    expect(noticeSchema.safeParse({ ...held, reason: "invalid-quote" }).success).toBe(true);
    expect(noticeSchema.safeParse({ ...held, reason: "bored" }).success).toBe(false);
    expect(noticeSchema.safeParse({ ...swap, extra: 1 }).success).toBe(false);
  });
});
