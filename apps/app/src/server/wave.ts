import { createHash } from "node:crypto";
import { usdcFromDollars } from "@strickle/arc/usdc";

export interface Tranche {
  id: number;
  maxUsers: number;
  perUserUnits: bigint;
  /** Days the tranche must run without an unresolved incident before the next one opens; `null` on the last tranche. */
  holdDays: number | null;
}

export interface WavePolicy {
  totalUnits: bigint;
  teamMaxSharePercent: number;
  tranches: readonly Tranche[];
}

export type WaveEvent = { kind: "opened"; tranche: number; at: Date } | { kind: "incident"; at: Date } | { kind: "resolved"; at: Date };

const DAY_MS = 86_400_000;
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

function onlyKeys(value: Record<string, unknown>, allowed: string[], where: string): void {
  const extra = Object.keys(value).filter((key) => !allowed.includes(key));
  if (extra.length > 0) throw new Error(`${where} has unknown fields: ${extra.join(", ")}`);
}

export function parseWavePolicy(raw: unknown): WavePolicy {
  if (!isRecord(raw)) throw new Error("the early-access policy must be an object");
  onlyKeys(raw, ["totalUsd", "teamMaxSharePercent", "tranches"], "the early-access policy");
  if (typeof raw.totalUsd !== "string") throw new Error("totalUsd must be a dollar string");
  const totalUnits = usdcFromDollars(raw.totalUsd, "totalUsd");
  const share = raw.teamMaxSharePercent;
  if (typeof share !== "number" || !Number.isInteger(share) || share < 0 || share > 100) throw new Error("teamMaxSharePercent must be a whole number from 0 to 100");
  const list: unknown = raw.tranches;
  if (!Array.isArray(list) || list.length === 0) throw new Error("the policy needs at least one tranche");

  const tranches = list.map((entry, index): Tranche => {
    if (!isRecord(entry)) throw new Error(`tranche ${index + 1} must be an object`);
    onlyKeys(entry, ["id", "maxUsers", "perUserUsd", "holdDays"], `tranche ${index + 1}`);
    const { id, maxUsers, perUserUsd, holdDays } = entry;
    if (id !== index + 1) throw new Error(`tranche ids must run 1, 2, 3...: found ${String(id)} at position ${index + 1}`);
    if (typeof maxUsers !== "number" || !Number.isInteger(maxUsers) || maxUsers < 1) throw new Error(`tranche ${id}: maxUsers must be a positive whole number`);
    if (typeof perUserUsd !== "string") throw new Error(`tranche ${id}: perUserUsd must be a dollar string`);
    const last = index === list.length - 1;
    if (last ? holdDays !== null : typeof holdDays !== "number" || !Number.isInteger(holdDays) || holdDays < 1) {
      throw new Error(last ? `tranche ${id} is the last one: holdDays must be null` : `tranche ${id}: holdDays must be a positive whole number of days`);
    }
    return { id, maxUsers, perUserUnits: usdcFromDollars(perUserUsd, `tranche ${id} perUserUsd`), holdDays: holdDays as number | null };
  });

  tranches.forEach((tranche, index) => {
    const before = tranches[index - 1];
    if (before && tranche.maxUsers <= before.maxUsers) throw new Error(`tranche ${tranche.id} must admit more people than tranche ${before.id}`);
    if (before && tranche.perUserUnits < before.perUserUnits) throw new Error(`tranche ${tranche.id} must not lower the per-user ceiling`);
  });
  const largest = tranches.reduce((max, tranche) => (tranche.perUserUnits > max ? tranche.perUserUnits : max), 0n);
  if (totalUnits < largest) throw new Error("totalUsd is below the largest per-user ceiling");
  return { totalUnits, teamMaxSharePercent: share, tranches };
}

const openTranche = (policy: WavePolicy, events: readonly WaveEvent[]): { tranche: Tranche; openedAt: Date } | undefined => {
  const last = [...events].reverse().find((event) => event.kind === "opened");
  const tranche = last ? policy.tranches.find((candidate) => candidate.id === last.tranche) : undefined;
  return last && tranche ? { tranche, openedAt: last.at } : undefined;
};

/** True while the latest incident has not been resolved. */
export const incidentOpen = (events: readonly WaveEvent[]): boolean => {
  let open = false;
  for (const event of [...events].sort((a, b) => a.at.getTime() - b.at.getTime())) {
    if (event.kind === "incident") open = true;
    if (event.kind === "resolved") open = false;
  }
  return open;
};

/** The ceilings that apply now, or `undefined` while no tranche has opened. */
export function limitsFor(policy: WavePolicy, events: readonly WaveEvent[]): { perUserUnits: bigint; totalUnits: bigint } | undefined {
  const open = openTranche(policy, events);
  return open ? { perUserUnits: open.tranche.perUserUnits, totalUnits: policy.totalUnits } : undefined;
}

export type Advance = { ok: true; next: number } | { ok: false; reason: "not-started" | "last" | "incident" } | { ok: false; reason: "hold"; until: Date };

export function canAdvance(policy: WavePolicy, events: readonly WaveEvent[], now: Date): Advance {
  const open = openTranche(policy, events);
  if (!open) return { ok: false, reason: "not-started" };
  const next = policy.tranches.find((tranche) => tranche.id === open.tranche.id + 1);
  if (!next || open.tranche.holdDays === null) return { ok: false, reason: "last" };
  if (incidentOpen(events)) return { ok: false, reason: "incident" };
  const resolvedAt = events.filter((event) => event.kind === "resolved").map((event) => event.at.getTime());
  const anchor = Math.max(open.openedAt.getTime(), ...resolvedAt);
  const until = new Date(anchor + open.tranche.holdDays * DAY_MS);
  return now.getTime() >= until.getTime() ? { ok: true, next: next.id } : { ok: false, reason: "hold", until };
}

export interface Issued {
  team: number;
  organic: number;
}

/** Seats of the open tranche. The team's share is a ceiling on team seats, not a reservation: unused team seats stay open to everyone else. */
export function seatsLeft(policy: WavePolicy, events: readonly WaveEvent[], issued: Issued): { tranche: number; capacity: number; left: number; teamLeft: number } {
  const open = openTranche(policy, events);
  if (!open) return { tranche: 0, capacity: 0, left: 0, teamLeft: 0 };
  const capacity = open.tranche.maxUsers;
  const left = Math.max(0, capacity - issued.team - issued.organic);
  const teamCap = Math.floor((capacity * policy.teamMaxSharePercent) / 100);
  return { tranche: open.tranche.id, capacity, left, teamLeft: Math.min(left, Math.max(0, teamCap - issued.team)) };
}

export type InvitePlan = { ok: true } | { ok: false; reason: "not-started" | "frozen" | "no-seats" | "team-cap"; left: number };

export function planInvites(policy: WavePolicy, events: readonly WaveEvent[], issued: Issued, request: { team: boolean; count: number }): InvitePlan {
  if (!Number.isInteger(request.count) || request.count < 1) throw new Error("count must be a positive whole number");
  if (!openTranche(policy, events)) return { ok: false, reason: "not-started", left: 0 };
  if (incidentOpen(events)) return { ok: false, reason: "frozen", left: 0 };
  const seats = seatsLeft(policy, events, issued);
  if (request.count > seats.left) return { ok: false, reason: "no-seats", left: seats.left };
  if (request.team && request.count > seats.teamLeft) return { ok: false, reason: "team-cap", left: seats.teamLeft };
  return { ok: true };
}

export interface Applicant {
  id: string;
  arrivedAt: Date;
  team: boolean;
}

/** First come, first served: by arrival, then by id, skipping a team applicant once the team's share is used. */
export function selectApplicants<T extends Applicant>(policy: WavePolicy, events: readonly WaveEvent[], issued: Issued, queue: readonly T[]): T[] {
  if (!openTranche(policy, events) || incidentOpen(events)) return [];
  const seats = seatsLeft(policy, events, issued);
  const ordered = [...queue].sort((a, b) => a.arrivedAt.getTime() - b.arrivedAt.getTime() || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const chosen: T[] = [];
  let left = seats.left;
  let teamLeft = seats.teamLeft;
  for (const applicant of ordered) {
    if (left === 0) break;
    if (applicant.team) {
      if (teamLeft === 0) continue;
      teamLeft -= 1;
    }
    left -= 1;
    chosen.push(applicant);
  }
  return chosen;
}

/** The digest an approval is bound to: change one character of the policy file and the approval no longer matches. */
export const policyDigest = (fileText: string): string => createHash("sha256").update(fileText).digest("hex");
