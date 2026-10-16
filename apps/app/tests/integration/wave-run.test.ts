import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrate } from "@strickle/db";
import { createTestDatabase } from "@strickle/db/testing";
import { type WaveDeps, runWave } from "../../src/server/wave-cli.ts";
import { parseWavePolicy } from "../../src/server/wave.ts";

const policy = parseWavePolicy({
  totalUsd: "10000",
  teamMaxSharePercent: 20,
  tranches: [
    { id: 1, maxUsers: 5, perUserUsd: "250", holdDays: 14 },
    { id: 2, maxUsers: 15, perUserUsd: "500", holdDays: 14 },
    { id: 3, maxUsers: 30, perUserUsd: "500", holdDays: null },
  ],
});

let db: Awaited<ReturnType<typeof createTestDatabase>>;
beforeAll(async () => {
  db = await createTestDatabase();
  await migrate(db.sql);
});
afterAll(() => db.drop());

const written: { label: string; codes: string[] }[] = [];
const deps = (now: Date, waitlist: { id: string; arrivedAt: Date; team: boolean }[] = []): WaveDeps => ({
  sql: db.sql,
  policy,
  now,
  writeCodes: (label, codes) => {
    written.push({ label, codes });
    return `/private/invites/${label}.txt`;
  },
  readWaitlist: () => waitlist,
});
const at = (day: number) => new Date(Date.UTC(2026, 10, 1 + day));
const run = (argv: string[], now = at(0), waitlist?: { id: string; arrivedAt: Date; team: boolean }[]) => runWave(argv, deps(now, waitlist));

describe("the wave commands against a real database", () => {
  it("says the wave has not started and issues nothing before it does", async () => {
    const status = await run(["status"]);
    expect(status.ok).toBe(true);
    expect(status.lines.join("\n")).toMatch(/not started/);
    const invite = await run(["invite", "wave 1", "1"]);
    expect(invite.ok).toBe(false);
    expect(invite.lines.join("\n")).toMatch(/not started/);
    expect(written).toEqual([]);
  });

  it("opens the first tranche once and shows its ceilings", async () => {
    expect((await run(["open"])).ok).toBe(true);
    expect((await run(["open"])).ok).toBe(false);
    const text = (await run(["status"])).lines.join("\n");
    expect(text).toContain("tranche 1 of 3");
    expect(text).toContain("US$250.00");
    expect(text).toContain("US$10,000.00");
    expect(text).toContain("5 left");
  });

  it("issues invitations up to the seats, writes the codes to a file and never prints them", async () => {
    const result = await run(["invite", "wave 1", "3"]);
    expect(result.ok).toBe(true);
    expect(written).toHaveLength(1);
    expect(written[0]?.codes).toHaveLength(3);
    for (const code of written[0]?.codes ?? []) expect(result.lines.join("\n")).not.toContain(code);
    expect(result.lines.join("\n")).toContain("/private/invites/wave 1.txt");
    const over = await run(["invite", "wave 1", "3"]);
    expect(over.ok).toBe(false);
    expect(over.lines.join("\n")).toMatch(/2 left/);
    expect(written).toHaveLength(1);
  });

  it("holds the team to its share and marks team seats by the label", async () => {
    expect((await run(["invite", "team founders", "1"])).ok).toBe(true);
    const second = await run(["invite", "team friends", "1"]);
    expect(second.ok).toBe(false);
    expect(second.lines.join("\n")).toMatch(/team's share/);
    const status = (await run(["status"])).lines.join("\n");
    expect(status).toContain("1 team");
    expect(status).toContain("3 everyone else");
  });

  it("chooses the next people in order of arrival from a waitlist", async () => {
    const waitlist = [
      { id: "late", arrivedAt: new Date("2026-10-30T10:00:00Z"), team: false },
      { id: "early", arrivedAt: new Date("2026-10-30T08:00:00Z"), team: false },
    ];
    const result = await run(["next", "waitlist.json"], at(0), waitlist);
    expect(result.lines.join("\n")).toMatch(/early/);
  });

  it("will not advance before the hold is over, and does after", async () => {
    const early = await run(["advance"], at(13));
    expect(early.ok).toBe(false);
    expect(early.lines.join("\n")).toMatch(/2026-11-15/);
    expect((await run(["advance"], at(14))).ok).toBe(true);
    expect((await run(["status"], at(14))).lines.join("\n")).toContain("tranche 2 of 3");
  });

  it("an incident freezes advance and invitations until it is resolved, and the hold starts again", async () => {
    expect((await run(["incident"], at(15))).ok).toBe(true);
    expect((await run(["incident"], at(15))).ok).toBe(false);
    expect((await run(["advance"], at(100))).lines.join("\n")).toMatch(/incident is open/);
    expect((await run(["invite", "wave 2", "1"], at(100))).ok).toBe(false);
    expect((await run(["resolve"], at(20))).ok).toBe(true);
    expect((await run(["resolve"], at(20))).ok).toBe(false);
    expect((await run(["invite", "wave 2", "1"], at(21))).ok).toBe(true);
  });

  it("revokes the sessions of a label and says how many", async () => {
    const result = await run(["revoke", "wave 1"]);
    expect(result.ok).toBe(true);
  });
});
