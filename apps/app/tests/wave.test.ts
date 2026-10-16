import { describe, expect, it } from "vitest";
import { canAdvance, incidentOpen, limitsFor, parseWavePolicy, planInvites, policyDigest, seatsLeft, selectApplicants, type WaveEvent } from "../src/server/wave.ts";

const raw = {
  totalUsd: "10000",
  teamMaxSharePercent: 20,
  tranches: [
    { id: 1, maxUsers: 5, perUserUsd: "250", holdDays: 14 },
    { id: 2, maxUsers: 15, perUserUsd: "500", holdDays: 14 },
    { id: 3, maxUsers: 30, perUserUsd: "500", holdDays: null },
  ],
};
const policy = parseWavePolicy(raw);
const day = (n: number) => new Date(Date.UTC(2026, 10, 1) + n * 86_400_000);
const opened = (tranche: number, at: Date): WaveEvent => ({ kind: "opened", tranche, at });
const incident = (at: Date): WaveEvent => ({ kind: "incident", at });
const resolved = (at: Date): WaveEvent => ({ kind: "resolved", at });
const none = { team: 0, organic: 0 };

describe("parseWavePolicy", () => {
  it("reads dollars into six-decimal base units and keeps the tranches in order", () => {
    expect(policy.totalUnits).toBe(10_000_000_000n);
    expect(policy.tranches.map((t) => [t.id, t.maxUsers, t.perUserUnits, t.holdDays])).toEqual([
      [1, 5, 250_000_000n, 14],
      [2, 15, 500_000_000n, 14],
      [3, 30, 500_000_000n, null],
    ]);
    expect(policy.teamMaxSharePercent).toBe(20);
  });

  it.each([
    ["no tranches", { ...raw, tranches: [] }],
    ["ids that skip", { ...raw, tranches: [{ ...raw.tranches[0], id: 2 }] }],
    ["a tranche that does not grow the wave", { ...raw, tranches: [raw.tranches[0], { ...raw.tranches[1], maxUsers: 5 }, raw.tranches[2]] }],
    ["a per-user ceiling that shrinks", { ...raw, tranches: [raw.tranches[1], { ...raw.tranches[0], id: 2, maxUsers: 30, holdDays: null }] }],
    ["a last tranche with a hold", { ...raw, tranches: [raw.tranches[0], { ...raw.tranches[1], holdDays: 14 }, { ...raw.tranches[2], holdDays: 14 }] }],
    ["a middle tranche without a hold", { ...raw, tranches: [{ ...raw.tranches[0], holdDays: null }, raw.tranches[1], raw.tranches[2]] }],
    ["a hold that is not a whole number of days", { ...raw, tranches: [{ ...raw.tranches[0], holdDays: 1.5 }, raw.tranches[1], raw.tranches[2]] }],
    ["a total below the largest per-user ceiling", { ...raw, totalUsd: "100" }],
    ["a team share above 100", { ...raw, teamMaxSharePercent: 101 }],
    ["a malformed dollar amount", { ...raw, totalUsd: "ten thousand" }],
    ["an unknown field", { ...raw, surprise: true }],
  ])("refuses %s", (_name, bad) => {
    expect(() => parseWavePolicy(bad)).toThrow();
  });
});

describe("incidentOpen", () => {
  it("is open from an incident until the next resolution, whatever the order the events arrive in", () => {
    expect(incidentOpen([])).toBe(false);
    expect(incidentOpen([incident(day(1))])).toBe(true);
    expect(incidentOpen([incident(day(1)), resolved(day(2))])).toBe(false);
    expect(incidentOpen([resolved(day(2)), incident(day(1))])).toBe(false);
    expect(incidentOpen([incident(day(1)), resolved(day(2)), incident(day(3))])).toBe(true);
  });
});

describe("limitsFor", () => {
  it("is absent until the first tranche opens, then follows the open tranche", () => {
    expect(limitsFor(policy, [])).toBeUndefined();
    expect(limitsFor(policy, [opened(1, day(0))])).toEqual({ perUserUnits: 250_000_000n, totalUnits: 10_000_000_000n });
    expect(limitsFor(policy, [opened(1, day(0)), opened(2, day(14))])?.perUserUnits).toBe(500_000_000n);
  });
});

describe("canAdvance", () => {
  it("cannot before anything opened, and cannot past the last tranche", () => {
    expect(canAdvance(policy, [], day(100))).toEqual({ ok: false, reason: "not-started" });
    expect(canAdvance(policy, [opened(1, day(0)), opened(2, day(14)), opened(3, day(28))], day(100))).toEqual({ ok: false, reason: "last" });
  });

  it("waits out the hold of the open tranche, to the day", () => {
    const events = [opened(1, day(0))];
    expect(canAdvance(policy, events, day(13))).toEqual({ ok: false, reason: "hold", until: day(14) });
    expect(canAdvance(policy, events, day(14))).toEqual({ ok: true, next: 2 });
  });

  it("an unresolved incident freezes the advance however long the wait", () => {
    const events = [opened(1, day(0)), incident(day(3))];
    expect(canAdvance(policy, events, day(60))).toEqual({ ok: false, reason: "incident" });
  });

  it("after the incident is resolved the hold starts again from the resolution", () => {
    const events = [opened(1, day(0)), incident(day(3)), resolved(day(5))];
    expect(canAdvance(policy, events, day(18))).toEqual({ ok: false, reason: "hold", until: day(19) });
    expect(canAdvance(policy, events, day(19))).toEqual({ ok: true, next: 2 });
  });

  it("an incident that predates the open tranche does not hold it back", () => {
    const events = [incident(day(-5)), resolved(day(-4)), opened(1, day(0))];
    expect(canAdvance(policy, events, day(14))).toEqual({ ok: true, next: 2 });
  });
});

describe("seatsLeft", () => {
  it("counts the open tranche's capacity and the team's cap, which is a share of it", () => {
    expect(seatsLeft(policy, [opened(1, day(0))], none)).toEqual({ tranche: 1, capacity: 5, left: 5, teamLeft: 1 });
    expect(seatsLeft(policy, [opened(2, day(14))], { team: 3, organic: 4 })).toEqual({ tranche: 2, capacity: 15, left: 8, teamLeft: 0 });
  });

  it("never reports a negative number, even when the policy shrank under existing invitations", () => {
    expect(seatsLeft(policy, [opened(1, day(0))], { team: 4, organic: 4 })).toEqual({ tranche: 1, capacity: 5, left: 0, teamLeft: 0 });
  });

  it("has no seats before the wave starts", () => {
    expect(seatsLeft(policy, [], none)).toEqual({ tranche: 0, capacity: 0, left: 0, teamLeft: 0 });
  });
});

describe("planInvites", () => {
  const events = [opened(1, day(0))];

  it("allows what fits and says what is left when it does not", () => {
    expect(planInvites(policy, events, none, { team: false, count: 5 })).toEqual({ ok: true });
    expect(planInvites(policy, events, none, { team: false, count: 6 })).toEqual({ ok: false, reason: "no-seats", left: 5 });
    expect(planInvites(policy, events, { team: 0, organic: 4 }, { team: false, count: 2 })).toEqual({ ok: false, reason: "no-seats", left: 1 });
  });

  it("holds the team to its share of the tranche", () => {
    expect(planInvites(policy, events, none, { team: true, count: 1 })).toEqual({ ok: true });
    expect(planInvites(policy, events, { team: 1, organic: 0 }, { team: true, count: 1 })).toEqual({ ok: false, reason: "team-cap", left: 0 });
  });

  it("issues nothing before the wave starts or while an incident is open", () => {
    expect(planInvites(policy, [], none, { team: false, count: 1 })).toEqual({ ok: false, reason: "not-started", left: 0 });
    expect(planInvites(policy, [...events, incident(day(2))], none, { team: false, count: 1 })).toEqual({ ok: false, reason: "frozen", left: 0 });
    expect(planInvites(policy, [...events, incident(day(2)), resolved(day(3))], none, { team: false, count: 1 })).toEqual({ ok: true });
  });

  it("refuses a count that is not a positive whole number", () => {
    for (const count of [0, -1, 1.5]) expect(() => planInvites(policy, events, none, { team: false, count })).toThrow();
  });
});

describe("selectApplicants", () => {
  const applicant = (id: string, minutes: number, team = false) => ({ id, arrivedAt: new Date(Date.UTC(2026, 10, 1, 0, minutes)), team });
  const events = [opened(1, day(0))];

  it("takes applicants in order of arrival, whoever they know", () => {
    const queue = [applicant("c", 30), applicant("a", 10), applicant("b", 20)];
    expect(selectApplicants(policy, events, none, queue).map((a) => a.id)).toEqual(["a", "b", "c"]);
  });

  it("stops at the open seats and breaks a tie by id", () => {
    const queue = ["g", "f", "e", "d", "c", "b", "a"].map((id) => applicant(id, 5));
    expect(selectApplicants(policy, events, none, queue).map((a) => a.id)).toEqual(["a", "b", "c", "d", "e"]);
  });

  it("skips a team applicant once the team's share is used, and keeps going down the queue", () => {
    const queue = [applicant("t1", 1, true), applicant("t2", 2, true), applicant("o1", 3), applicant("o2", 4)];
    expect(selectApplicants(policy, events, none, queue).map((a) => a.id)).toEqual(["t1", "o1", "o2"]);
  });

  it("selects nobody while an incident is open", () => {
    expect(selectApplicants(policy, [...events, incident(day(1))], none, [applicant("a", 1)])).toEqual([]);
  });
});

describe("policyDigest", () => {
  it("changes with a single character, so an approval is bound to the exact numbers", () => {
    const text = JSON.stringify(raw);
    expect(policyDigest(text)).toMatch(/^[0-9a-f]{64}$/);
    expect(policyDigest(text)).toBe(policyDigest(text));
    expect(policyDigest(text.replace("250", "251"))).not.toBe(policyDigest(text));
  });
});
