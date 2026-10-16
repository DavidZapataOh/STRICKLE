import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrate } from "../../src/migrate.ts";
import { createTestDatabase } from "../../src/testing.ts";
import { issuedCounts, recordWaveEvent, waveEvents } from "../../src/wave.ts";

let db: Awaited<ReturnType<typeof createTestDatabase>>;
beforeAll(async () => {
  db = await createTestDatabase();
  await migrate(db.sql);
});
afterAll(() => db.drop());

describe("wave events", () => {
  it("starts empty and returns what was recorded, oldest first", async () => {
    expect(await waveEvents(db.sql)).toEqual([]);
    await recordWaveEvent(db.sql, { kind: "opened", tranche: 1 });
    await recordWaveEvent(db.sql, { kind: "incident" });
    await recordWaveEvent(db.sql, { kind: "resolved" });
    const events = await waveEvents(db.sql);
    expect(events.map((event) => event.kind)).toEqual(["opened", "incident", "resolved"]);
    expect(events[0]).toMatchObject({ kind: "opened", tranche: 1 });
    expect(events[1]?.at).toBeInstanceOf(Date);
    expect("tranche" in (events[1] ?? {})).toBe(false);
  });

  it("stores the time it is given, so a caller's clock and the events agree", async () => {
    const at = new Date("2026-11-01T00:00:00Z");
    await recordWaveEvent(db.sql, { kind: "incident" }, at);
    const events = await waveEvents(db.sql);
    expect(events.at(-1)?.at.toISOString()).toBe(at.toISOString());
  });

  it("opens a tranche only once", async () => {
    await expect(recordWaveEvent(db.sql, { kind: "opened", tranche: 1 })).rejects.toThrow();
    await recordWaveEvent(db.sql, { kind: "opened", tranche: 2 });
  });

  it("refuses an opened event without a tranche and a tranche on any other event", async () => {
    await expect(db.sql`insert into wave_events (kind) values ('opened')`).rejects.toThrow();
    await expect(db.sql`insert into wave_events (kind, tranche) values ('incident', 1)`).rejects.toThrow();
    await expect(db.sql`insert into wave_events (kind) values ('exploded')`).rejects.toThrow();
  });
});

describe("issuedCounts", () => {
  it("counts every invitation by whether its label marks a team seat", async () => {
    expect(await issuedCounts(db.sql)).toEqual({ team: 0, organic: 0 });
    await db.sql`insert into invites (code_hash, label) values ('a', 'team founders'), ('b', 'team'), ('c', 'wave 1'), ('d', 'wave 1'), ('e', 'tea party')`;
    expect(await issuedCounts(db.sql)).toEqual({ team: 2, organic: 3 });
  });
});
