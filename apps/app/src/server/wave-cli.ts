import { createInvites, issuedCounts, recordWaveEvent, revokeInvites, waveEvents } from "@strickle/db";
import { formatMoney } from "@strickle/design/format";
import type { Sql } from "postgres";
import { type Applicant, type WavePolicy, canAdvance, incidentOpen, limitsFor, planInvites, seatsLeft, selectApplicants } from "./wave.ts";

export type WaveCommand =
  | { kind: "status" | "open" | "advance" | "incident" | "resolve" }
  | { kind: "invite"; label: string; count: number }
  | { kind: "revoke"; label: string }
  | { kind: "next"; file: string };

const USAGE = "usage: wave <status|open|advance|incident|resolve|invite <label> <count>|revoke <label>|next <waitlist.json>>";
// Lower case on purpose: a team seat is an invitation whose label starts with "team", and the database counts them with a case-sensitive prefix.
const LABEL = /^[a-z0-9][a-z0-9 _-]{0,39}$/;
const MAX_PER_BATCH = 50;

export function parseWaveArgs(argv: readonly string[]): WaveCommand {
  const [command, ...rest] = argv;
  const exactly = (count: number) => {
    if (rest.length !== count) throw new Error(USAGE);
  };
  const label = (value: string | undefined): string => {
    if (!value || !LABEL.test(value)) throw new Error("a label is lower-case letters, digits, spaces, dashes or underscores, up to forty characters");
    return value;
  };
  switch (command) {
    case "status":
    case "open":
    case "advance":
    case "incident":
    case "resolve":
      exactly(0);
      return { kind: command };
    case "invite": {
      exactly(2);
      const count = Number(rest[1]);
      if (!Number.isInteger(count) || count < 1 || count > MAX_PER_BATCH) throw new Error(`the count is a whole number from 1 to ${MAX_PER_BATCH}`);
      return { kind: "invite", label: label(rest[0]), count };
    }
    case "revoke":
      exactly(1);
      return { kind: "revoke", label: label(rest[0]) };
    case "next":
      exactly(1);
      return { kind: "next", file: rest[0] as string };
    default:
      throw new Error(USAGE);
  }
}

/** A waitlist is a JSON array of `{ "id": string, "arrivedAt": ISO date, "team": boolean }`, kept by the owner outside the repository. */
export function parseWaitlist(text: string): Applicant[] {
  const raw: unknown = JSON.parse(text);
  if (!Array.isArray(raw)) throw new Error("the waitlist must be a JSON array");
  return raw.map((entry, index) => {
    const { id, arrivedAt, team } = (entry ?? {}) as Record<string, unknown>;
    const when = typeof arrivedAt === "string" ? new Date(arrivedAt) : undefined;
    if (typeof id !== "string" || id === "" || !when || Number.isNaN(when.getTime()) || typeof team !== "boolean") throw new Error(`waitlist entry ${index + 1} needs an id, an ISO arrivedAt and a team flag`);
    return { id, arrivedAt: when, team };
  });
}

export interface WaveDeps {
  sql: Sql;
  policy: WavePolicy;
  now: Date;
  /** Writes the codes where only the owner reads them and returns the path; the codes are never printed. */
  writeCodes(label: string, codes: string[]): string;
  readWaitlist(file: string): Applicant[];
}

const isTeamLabel = (label: string) => label.startsWith("team");
const money = (units: bigint) => formatMoney(units, "en");
const refuse = (...lines: string[]) => ({ ok: false, lines });
const WHY = { "not-started": "the wave has not started", frozen: "an incident is open", "no-seats": "there are not enough open seats", "team-cap": "the team's share of this tranche is used" } as const;

export async function runWave(argv: readonly string[], deps: WaveDeps): Promise<{ ok: boolean; lines: string[] }> {
  const command = parseWaveArgs(argv);
  const { sql, policy, now } = deps;
  const events = await waveEvents(sql);
  const issued = await issuedCounts(sql);

  switch (command.kind) {
    case "status": {
      const limits = limitsFor(policy, events);
      if (!limits) return { ok: true, lines: ['wave not started: run "open" to open tranche 1'] };
      const seats = seatsLeft(policy, events, issued);
      const advance = canAdvance(policy, events, now);
      const next =
        advance.ok ? `tranche ${advance.next} can open now`
        : advance.reason === "hold" ? `the next tranche opens on ${advance.until.toISOString().slice(0, 10)}`
        : advance.reason === "incident" ? "advance is frozen by an open incident"
        : "this is the last tranche";
      return {
        ok: true,
        lines: [
          `tranche ${seats.tranche} of ${policy.tranches.length}: up to ${seats.capacity} people, ${money(limits.perUserUnits)} each, ${money(limits.totalUnits)} in all`,
          `seats: ${seats.left} left (${seats.teamLeft} for the team)`,
          `issued: ${issued.team} team, ${issued.organic} everyone else`,
          incidentOpen(events) ? "an incident is open: no new invitations" : "no incident open",
          next,
        ],
      };
    }
    case "open": {
      if (events.some((event) => event.kind === "opened")) return refuse("a tranche is already open: use advance for the next one");
      await recordWaveEvent(sql, { kind: "opened", tranche: 1 }, now);
      return { ok: true, lines: ["tranche 1 opened"] };
    }
    case "advance": {
      const advance = canAdvance(policy, events, now);
      if (!advance.ok) {
        const why = advance.reason === "hold" ? `the hold is not over: it ends on ${advance.until.toISOString().slice(0, 10)}` : advance.reason === "incident" ? "an incident is open: resolve it first" : advance.reason === "last" ? "this is the last tranche" : "the wave has not started";
        return refuse(`cannot advance: ${why}`);
      }
      await recordWaveEvent(sql, { kind: "opened", tranche: advance.next }, now);
      return { ok: true, lines: [`tranche ${advance.next} opened`] };
    }
    case "incident": {
      if (incidentOpen(events)) return refuse("an incident is already open");
      await recordWaveEvent(sql, { kind: "incident" }, now);
      return { ok: true, lines: ["incident recorded: advance and new invitations are frozen until it is resolved"] };
    }
    case "resolve": {
      if (!incidentOpen(events)) return refuse("there is no open incident");
      await recordWaveEvent(sql, { kind: "resolved" }, now);
      return { ok: true, lines: ["incident resolved: the hold of the open tranche starts again from now"] };
    }
    case "invite": {
      const plan = planInvites(policy, events, issued, { team: isTeamLabel(command.label), count: command.count });
      if (!plan.ok) return refuse(`cannot issue ${command.count}: ${WHY[plan.reason]} (${plan.left} left)`);
      const codes = await createInvites(sql, command.label, command.count);
      const path = deps.writeCodes(command.label, codes);
      return { ok: true, lines: [`issued ${command.count} invitations as "${command.label}"; the codes are in ${path}`] };
    }
    case "revoke": {
      const revoked = await revokeInvites(sql, command.label);
      return { ok: true, lines: [`revoked ${revoked} live sessions issued from "${command.label}"`] };
    }
    case "next": {
      const chosen = selectApplicants(policy, events, issued, deps.readWaitlist(command.file));
      return { ok: true, lines: chosen.length === 0 ? ["nobody can be invited now"] : [`invite, in this order: ${chosen.map((applicant) => applicant.id).join(", ")}`] };
    }
  }
}
