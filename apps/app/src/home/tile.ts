import type { PlanNotice } from "@strickle/agent/notice-schema";

export type TileState = "secured" | "approval" | "partial" | "held" | "stale" | "none";
export type TileReason = PlanNotice["salary"]["binding"] | "paused" | "halted" | "approval";

export interface Tile {
  state: TileState;
  next: string;
  owed: bigint;
  payNow: bigint;
  pending: bigint;
  reason: TileReason | null;
  checked: string;
}

const DAY_MS = 86_400_000;
const MAX_AGE_DAYS = 2;

/**
 * "Secured" is a promise: it is said only for a fresh plan whose own decision pays the whole salary, that the agent may pay without a signature, while the agent is running.
 * Anything else says what is in the way.
 */
export function salaryTile(plan: PlanNotice, todayIso: string, agentPaused: boolean): Tile {
  const owed = BigInt(plan.salary.owed);
  const safe = BigInt(plan.salary.safeNow);
  const payNow = safe < owed ? safe : owed;
  const base = { next: plan.salary.next, owed, payNow, pending: BigInt(plan.salary.pending), checked: plan.asOf };
  const age = (Date.parse(`${todayIso}T00:00:00Z`) - Date.parse(`${plan.asOf}T00:00:00Z`)) / DAY_MS;
  // a plan dated after our own clock means one of the two clocks is wrong: not a reason to promise anything
  if (!Number.isFinite(age) || age > MAX_AGE_DAYS || age < -1) return { ...base, state: "stale", reason: null };
  if (owed === 0n) return { ...base, state: "none", reason: null };
  if (agentPaused) return { ...base, state: "held", reason: "paused" };
  if (plan.salary.halted) return { ...base, state: "held", reason: "halted" };
  if (plan.salary.binding !== "full" || payNow < owed) return { ...base, state: "partial", reason: plan.salary.binding };
  if (plan.salary.needsApproval) return { ...base, state: "approval", reason: "approval" };
  return { ...base, state: "secured", reason: null };
}
