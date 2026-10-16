import { addDays, formatPlainDate, plainDate } from "@strickle/core";
import { getAddress } from "viem";
import { describe, expect, it } from "vitest";
import { planNoticeSchema } from "../enclave/notice-schema.ts";
import { buildPlanNotice, cushionDays, nextSalaryDate } from "../enclave/plan.ts";
import { profileSchema } from "../enclave/profile.ts";
import type { TickBooks } from "../enclave/tick.ts";

const vault = getAddress("0x00000000000000000000000000000000000000a1");
const today = plainDate(2026, 11, 1);
const NOW = Date.UTC(2026, 10, 1, 0, 5) / 1000;
const zero = { taxes: 0n, payroll: 0n, salary: 0n, operating: 0n, emergency: 0n, profit: 0n };
const books = (patch: Partial<TickBooks["boxes"]> = {}): TickBooks => ({ boxes: { ...zero, salary: 1_000_000n, operating: 3_000_000n, emergency: 4_000_000n, ...patch }, invested: zero, unallocated: 0n });
const weekly = (weeks: number, source = "deposit"): [string, string, string][] => Array.from({ length: weeks }, (_, i) => [formatPlainDate(addDays(today, -7 * (i + 1))), "500000000", source]);
const profile = (patch: Record<string, unknown> = {}) =>
  profileSchema.parse({
    version: 1, taxRateBps: 1800, taxBufferBps: 10_500, payrollShareBps: 10_000, floorDays: 14, targetDays: 42,
    dailySpend: "20000", payrollDue: "0", salaryOwed: "1000000", emergencyTarget: "5000000", taxesDue: "0",
    salary: { proposed: "1000000", pending: "0", payee: "0x00000000000000000000000000000000000000b2", day: 1, lastPaid: "2026-11" },
    limits: { dailyCap: "100000000", signatureThreshold: "100000000" },
    history: weekly(8), taxDates: ["2026-11-17", "2026-12-17"],
    ...patch,
  });
const build = (p = profile(), b = books()) => buildPlanNotice({ profile: p, books: b, today, vault, nowSeconds: NOW });

describe("nextSalaryDate", () => {
  it("is this month's day while it is still ahead and unpaid", () => {
    expect(formatPlainDate(nextSalaryDate(plainDate(2026, 11, 1), 1, ""))).toBe("2026-11-01");
    expect(formatPlainDate(nextSalaryDate(plainDate(2026, 11, 20), 28, "2026-10"))).toBe("2026-11-28");
  });
  it("moves to next month once paid or once the day has passed", () => {
    expect(formatPlainDate(nextSalaryDate(plainDate(2026, 11, 1), 1, "2026-11"))).toBe("2026-12-01");
    expect(formatPlainDate(nextSalaryDate(plainDate(2026, 11, 2), 1, ""))).toBe("2026-12-01");
    expect(formatPlainDate(nextSalaryDate(plainDate(2026, 12, 29), 5, "2026-12"))).toBe("2027-01-05");
  });
});

describe("cushionDays", () => {
  it("counts operating cash and the emergency fund in days of spending", () => {
    expect(cushionDays(books(), 20_000n)).toBe(350);
  });
  it("is unknown without a daily spend and never fractional", () => {
    expect(cushionDays(books(), 0n)).toBeNull();
    expect(cushionDays(books({ operating: 19_999n, emergency: 0n }), 20_000n)).toBe(0);
  });
});

describe("buildPlanNotice", () => {
  it("builds a notice that matches the shared schema", () => {
    const notice = build();
    expect(planNoticeSchema.safeParse(notice).success).toBe(true);
    expect(notice.asOf).toBe("2026-11-01");
    expect(notice.salary.next).toBe("2026-12-01");
    expect(notice.salary.owed).toBe("1000000");
    expect(notice.forecast.p10).toHaveLength(13);
    expect(notice.forecast.p50).toHaveLength(13);
    expect(notice.forecast.floor).toBe(String(14n * 20_000n));
    expect(notice.forecast.opening).toBe(String(4_000_000n));
    expect(notice.forecast.basis).toBe("observed");
    expect(notice.rates.taxBps).toBe(1800);
  });

  it("derives the share above the floor from the real decision", () => {
    const notice = build();
    expect(notice.salary.aboveFloorBps).toBeGreaterThanOrEqual(0);
    expect(notice.salary.aboveFloorBps).toBeLessThanOrEqual(10_000);
    expect(notice.salary.binding).toBe("full");
    expect(BigInt(notice.salary.safeNow)).toBeGreaterThanOrEqual(BigInt(notice.salary.owed));
  });

  it("says why when the salary is not fully payable", () => {
    const notice = build(profile({ taxesDue: "999999999999" }));
    expect(notice.salary.binding).toBe("taxes-not-covered");
    expect(BigInt(notice.salary.safeNow)).toBe(0n);
  });

  it("asks for approval exactly when the payable amount is above the signature threshold", () => {
    expect(build().salary.needsApproval).toBe(false);
    expect(build(profile({ limits: { dailyCap: "100000000", signatureThreshold: "0" } })).salary.needsApproval).toBe(true);
    expect(build(profile({ limits: { dailyCap: "100000000", signatureThreshold: "1000000" } })).salary.needsApproval).toBe(false);
    expect(build(profile({ taxesDue: "999999999999", limits: { dailyCap: "100000000", signatureThreshold: "0" } })).salary.needsApproval).toBe(false);
  });

  it("lists only open proposals: pending and not expired", () => {
    const proposal = (id: string, status: string, expiresAt: number) => ({ id, kind: "salary-day-one", amount: "1000000", payee: "0x00000000000000000000000000000000000000b2", digest: `0x${"ab".repeat(32)}`, createdAt: NOW, expiresAt, status, decidedAt: 0 });
    const notice = build(profile({ proposals: [proposal("open", "pending", NOW + 100), proposal("late", "pending", NOW - 1), proposal("done", "executed", NOW + 100)] }));
    expect(notice.proposals.map((entry) => entry.id)).toEqual(["open"]);
  });

  it("reports a halted agent", () => {
    expect(build(profile({ breaker: { halted: true, since: "2026-10-30", codes: ["daily-cap"] } })).salary.halted).toBe(true);
  });

  it("labels a forecast built only on the user's own estimate and gives the salary no real history", () => {
    const notice = build(profile({ history: weekly(8, "estimate") }));
    expect(notice.forecast.basis).toBe("estimate");
    expect(notice.salary.binding).toBe("insufficient-history");
  });

  it("lists the salary dates, the payrolls and the tax dates ahead, ascending, without amounts for taxes", () => {
    const notice = build(profile({ payrolls: [["2026-11-20", "300000"], ["2026-10-01", "1"]] }));
    expect(notice.events.map((event) => `${event.date} ${event.kind}`)).toEqual(["2026-11-17 tax", "2026-11-20 payroll", "2026-12-01 salary", "2026-12-17 tax", "2027-01-01 salary"]);
    expect(notice.events.find((event) => event.kind === "tax")?.amount).toBeNull();
    expect(notice.events.find((event) => event.kind === "payroll")?.amount).toBe("300000");
  });

  it("states the box targets, with zero meaning none", () => {
    expect(build().targets).toEqual({ taxes: "0", payroll: "0", salary: "1000000", operating: String(42n * 20_000n), emergency: "5000000" });
  });

  it("is deterministic and changes with the books", () => {
    const a = build();
    expect(build()).toEqual(a);
    expect(build(profile(), books({ operating: 50_000n }))).not.toEqual(a);
  });

  it("stays well inside the notice size limit even at the schema's widest", () => {
    const wide = profile({
      payrolls: Array.from({ length: 24 }, (_, i) => [`2026-11-${String((i % 27) + 1).padStart(2, "0")}`, "9".repeat(30)]),
      taxDates: Array.from({ length: 12 }, (_, i) => `2027-${String(i + 1).padStart(2, "0")}-15`),
      emergencyTarget: "9".repeat(30),
    });
    expect(new TextEncoder().encode(JSON.stringify(build(wide))).length).toBeLessThan(3_000);
  });
});
