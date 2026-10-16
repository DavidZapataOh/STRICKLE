// workflows/agent/tests/tick.test.ts
import { addDays, formatPlainDate, plainDate } from "@strickle/core";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { type TickBooks, planTick } from "../enclave/tick.ts";
import { type Profile, profileSchema } from "../enclave/profile.ts";

const today = plainDate(2026, 11, 1);
const NOW = Date.UTC(2026, 10, 1, 0, 5) / 1000;
const vault = "0x00000000000000000000000000000000000000a1" as const;
const payee = "0x00000000000000000000000000000000000000b2";
const boxes = (patch: Partial<Record<"taxes" | "payroll" | "salary" | "operating" | "emergency" | "profit", bigint>> = {}) => ({
  taxes: 0n, payroll: 0n, salary: 1_000_000n, operating: 3_000_000n, emergency: 0n, profit: 0n, ...patch,
});
const books = (patch: Partial<TickBooks> = {}): TickBooks => ({ boxes: boxes(), invested: boxes({ taxes: 0n, payroll: 0n, salary: 0n, operating: 0n, emergency: 0n, profit: 0n }), unallocated: 0n, ...patch });
const weekly = (weeks: number): [string, string, string][] =>
  Array.from({ length: weeks }, (_, i) => [formatPlainDate(addDays(today, -7 * (i + 1))), "500000000", "deposit"]);

const base: Profile = profileSchema.parse({
  version: 1, taxRateBps: 0, taxBufferBps: 10_500, payrollShareBps: 10_000, floorDays: 14, targetDays: 42,
  dailySpend: "20000", payrollDue: "0", salaryOwed: "0", emergencyTarget: "0",
  salary: { proposed: "1000000", pending: "0", payee, day: 1, lastPaid: "" },
  limits: { dailyCap: "100000000", signatureThreshold: "100000000" },
  history: weekly(8),
});

describe("planTick", () => {
  it("does nothing twice on the same day", () => {
    const ticked = { ...base, tick: { ...base.tick, lastDay: formatPlainDate(today) } };
    expect(planTick(ticked, books(), today, vault, NOW)).toEqual({ kind: "skip" });
  });

  it("only refreshes the forecast on an ordinary day", () => {
    const plan = planTick(base, books(), plainDate(2026, 11, 2), vault, NOW);
    expect(plan.kind).toBe("tick");
    if (plan.kind !== "tick") return;
    expect(plan.next.tick.lastDay).toBe("2026-11-02");
    expect(BigInt(plan.next.tick.p50)).toBeGreaterThanOrEqual(4_000_000n);
    expect(plan.next.salary.lastPaid).toBe("");
  });

  it("is deterministic for the same inputs", () => {
    expect(planTick(base, books(), today, vault, NOW)).toEqual(planTick(base, books(), today, vault, NOW));
  });

  it("pays the full salary on day one when every gate is open", () => {
    const plan = planTick(base, books(), today, vault, NOW);
    expect(plan).toMatchObject({ kind: "salary", payee, amount: 1_000_000n, seen: 1_000_000n });
    if (plan.kind !== "salary") return;
    expect(plan.next.salary).toMatchObject({ pending: "0", lastPaid: "2026-11" });
    expect(plan.next.salaryOwed).toBe("1000000");
  });

  it("pays only what the salary box holds and keeps the rest pending", () => {
    const plan = planTick(base, books({ boxes: boxes({ salary: 400_000n }) }), today, vault, NOW);
    expect(plan).toMatchObject({ kind: "salary", amount: 400_000n });
    if (plan.kind !== "salary") return;
    expect(plan.next.salary.pending).toBe("600000");
  });

  it("carries a pending salary into the next payment", () => {
    const owing = { ...base, salary: { ...base.salary, pending: "600000" } };
    const plan = planTick(owing, books({ boxes: boxes({ salary: 1_600_000n }) }), today, vault, NOW);
    expect(plan).toMatchObject({ kind: "salary", amount: 1_600_000n });
  });

  it.each([
    ["taxes are not covered", { ...base, taxesDue: "10000000" }, books()],
    ["there is less than four weeks of history", { ...base, history: weekly(2) }, books()],
    ["the daily spend is unknown", { ...base, dailySpend: "0" }, books()],
    ["no payee is set", { ...base, salary: { ...base.salary, payee: "0x" + "0".repeat(40) } }, books()],
    ["the signature threshold is below the amount", { ...base, limits: { dailyCap: "100000000", signatureThreshold: "10" } }, books()],
    ["the daily cap is zero", { ...base, limits: { dailyCap: "0", signatureThreshold: "100000000" } }, books()],
    ["the breaker is halted", { ...base, breaker: { halted: true, since: "2026-10-30", codes: ["books-balance"] } }, books()],
  ])("pays nothing and keeps the whole salary pending when %s", (_name, profile, vaultBooks) => {
    const plan = planTick(profile, vaultBooks, today, vault, NOW);
    expect(plan.kind).not.toBe("salary");
    if (plan.kind === "skip") throw new Error("a salary day must not be skipped");
    if (!profile.breaker.halted) expect(plan.next.salary.pending).toBe("1000000");
  });

  it("pays once a month", () => {
    const paid = { ...base, salary: { ...base.salary, lastPaid: "2026-11" } };
    expect(planTick(paid, books(), today, vault, NOW).kind).toBe("tick");
  });

  it("only pays on the salary day", () => {
    expect(planTick({ ...base, salary: { ...base.salary, day: 15 } }, books(), today, vault, NOW).kind).toBe("tick");
  });

  it("keeps funding next month's salary through the cascade", () => {
    const plan = planTick(base, books({ boxes: boxes({ salary: 250_000n }) }), plainDate(2026, 11, 2), vault, NOW);
    if (plan.kind !== "tick") throw new Error("expected a tick");
    expect(plan.next.salaryOwed).toBe("750000");
  });

  it("never pays more than the box holds and never loses owed salary", () => {
    fc.assert(
      fc.property(fc.bigInt({ min: 0n, max: 5_000_000n }), fc.bigInt({ min: 0n, max: 3_000_000n }), fc.bigInt({ min: 0n, max: 3_000_000n }), (salaryBox, proposed, pending) => {
        const profile = { ...base, salary: { ...base.salary, proposed: String(proposed), pending: String(pending) } };
        const plan = planTick(profile, books({ boxes: boxes({ salary: salaryBox }) }), today, vault, NOW);
        if (plan.kind === "salary") {
          expect(plan.amount).toBeLessThanOrEqual(salaryBox);
          expect(plan.amount + BigInt(plan.next.salary.pending)).toBe(proposed + pending);
        } else if (plan.kind === "tick") {
          expect(BigInt(plan.next.salary.pending)).toBe(proposed + pending === 0n ? 0n : proposed + pending);
        }
      }),
    );
  });
});

describe("proposals and notices", () => {
  const sign = { ...base, limits: { dailyCap: "100000000", signatureThreshold: "10" } };

  it("turns a salary that only lacks a signature into a pending proposal", () => {
    const plan = planTick(sign, books(), today, vault, NOW);
    if (plan.kind !== "tick") throw new Error("expected a tick");
    expect(plan.next.proposals).toHaveLength(1);
    expect(plan.next.proposals[0]).toMatchObject({ id: "salary-2026-11", kind: "salary-day-one", amount: "1000000", payee, status: "pending", createdAt: NOW });
    expect(plan.next.proposals[0].expiresAt).toBe(NOW + 604_800);
    expect(plan.next.salary.pending).toBe("1000000");
    expect(plan.notices).toEqual([expect.objectContaining({ kind: "proposal", proposalId: "salary-2026-11", amount: "1000000", payee })]);
  });

  it("does not repeat a proposal for the same month", () => {
    const first = planTick(sign, books(), today, vault, NOW);
    if (first.kind !== "tick") throw new Error("expected a tick");
    const again = planTick({ ...first.next, tick: { ...first.next.tick, lastDay: "" }, salary: { ...first.next.salary, lastPaid: "" } }, books(), today, vault, NOW + 60);
    if (again.kind !== "tick") throw new Error("expected a tick");
    expect(again.next.proposals).toHaveLength(1);
    expect(again.notices).toEqual([]);
  });

  it("does not propose when another invariant holds the payment", () => {
    const plan = planTick({ ...sign, limits: { dailyCap: "0", signatureThreshold: "10" } }, books(), today, vault, NOW);
    if (plan.kind !== "tick") throw new Error("expected a tick");
    expect(plan.next.proposals).toEqual([]);
  });

  it("announces a paid salary", () => {
    const plan = planTick(base, books(), today, vault, NOW);
    expect(plan.kind === "salary" && plan.notices).toEqual([{ kind: "salary", month: "2026-11", paid: "1000000", pending: "0" }]);
  });

  it("says nothing on an ordinary day", () => {
    const plan = planTick(base, books(), plainDate(2026, 11, 2), vault, NOW);
    expect(plan.kind === "tick" && plan.notices).toEqual([]);
  });
});
