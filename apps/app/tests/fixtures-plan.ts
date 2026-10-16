import { BOX_KINDS } from "@strickle/core";
import type { PlanNotice } from "@strickle/agent/notice-schema";
import type { Snapshot } from "../src/chain/snapshot.ts";

export const zeroRule = { delaySeconds: 0, alwaysDelayed: false, restricted: false, floor: 0n, lockedUntil: 0 };

export const vaultState = (balances: Partial<Record<(typeof BOX_KINDS)[number], bigint>> = {}, patch: Partial<Snapshot["vault"]> = {}): Snapshot["vault"] => ({
  boxes: BOX_KINDS.map((kind, index) => ({ kind, id: index + 1, usdc: balances[kind] ?? 0n, eurc: 0n, invested: 0n, rule: zeroRule })),
  unallocatedUsdc: 0n,
  agent: "0x00000000000000000000000000000000000000f3",
  agentPaused: false,
  now: 1_800_000_000,
  ...patch,
});

export const planNotice = (patch: Partial<PlanNotice> = {}): PlanNotice => ({
  kind: "plan",
  asOf: "2026-11-01",
  salary: { next: "2026-12-01", owed: "1800000000", safeNow: "1800000000", pending: "0", binding: "full", aboveFloorBps: 9800, lastPaid: "2026-11", needsApproval: false, halted: false },
  proposals: [],
  cushion: { days: 42, floorDays: 14, targetDays: 42 },
  forecast: { floor: "280000000", opening: "800000000", p10: ["500000000", "300000000", "250000000"], p50: ["900000000", "950000000", "1000000000"], basis: "observed" },
  events: [{ date: "2026-12-01", kind: "salary", amount: "1800000000" }, { date: "2026-12-17", kind: "tax", amount: null }],
  targets: { taxes: "0", payroll: "0", salary: "0", operating: "0", emergency: "0" },
  rates: { taxBps: 1800 },
  settings: { proposed: "1800000000", day: 1, payee: "0x00000000000000000000000000000000000000b2", dailyCap: "100000000", signatureThreshold: "0", floorDays: 14, targetDays: 42, halted: false, haltCodes: [] },
  ...patch,
});

export const snapshotOf = (patch: Partial<Snapshot> = {}): Snapshot => ({
  vault: vaultState({ taxes: 270_000_000n }),
  payments: [],
  olderPayments: false,
  plan: planNotice(),
  key: "present",
  activity: "ok",
  fetchedAt: 0,
  ...patch,
});
