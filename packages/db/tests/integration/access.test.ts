import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createInvites, inviteStats, newInviteCode, normalizeInvite, redeemInviteWithSession, revokeInvites, revokeSession, sessionActive } from "../../src/access.ts";
import { migrate } from "../../src/migrate.ts";
import { createTestDatabase } from "../../src/testing.ts";

let db: Awaited<ReturnType<typeof createTestDatabase>>;
beforeAll(async () => {
  db = await createTestDatabase();
  await migrate(db.sql);
});
afterAll(() => db.drop());

const later = (seconds: number) => new Date(Date.now() + seconds * 1000);
const session = (overrides: Partial<{ sid: string; expiresAt: Date }> = {}) => ({ sid: randomUUID(), expiresAt: later(3600), ...overrides });

describe("invite codes", () => {
  it("are 80 random bits in four groups of Crockford base32", () => {
    const code = newInviteCode();
    expect(code).toMatch(/^[0-9A-HJKMNP-TV-Z]{4}(-[0-9A-HJKMNP-TV-Z]{4}){3}$/);
    expect(newInviteCode()).not.toBe(code);
  });

  it("forgive the look-alike characters and the formatting people type", () => {
    expect(normalizeInvite("abcd-0o1i-llxy-z234")).toBe("ABCD0011" + "11XY" + "Z234");
    expect(normalizeInvite("ab cd-0O1I")).toBe(normalizeInvite("ABCD0O1I"));
  });
});

describe("redeeming", () => {
  it("accepts a code once, with its session, and never the same code again", async () => {
    const [code] = await createInvites(db.sql, "wave 1", 1);
    const first = session();
    expect(await redeemInviteWithSession(db.sql, code as string, first)).toBe(true);
    expect(await redeemInviteWithSession(db.sql, code as string, session())).toBe(false);
    expect(await sessionActive(db.sql, first.sid, new Date())).toBe(true);
  });

  it("lets exactly one of many simultaneous redemptions win, and leaves exactly one session", async () => {
    const [code] = await createInvites(db.sql, "race", 1);
    const results = await Promise.all(Array.from({ length: 20 }, () => redeemInviteWithSession(db.sql, code as string, session())));
    expect(results.filter(Boolean)).toHaveLength(1);
    const rows = await db.sql<{ n: string }[]>`select count(*) as n from access_sessions s join invites i on i.id = s.invite_id where i.label = 'race'`;
    expect(Number(rows[0]?.n)).toBe(1);
  });

  it("does not burn the code when the session cannot be stored", async () => {
    const [first, second] = await createInvites(db.sql, "atomic", 2);
    const taken = session();
    expect(await redeemInviteWithSession(db.sql, first as string, taken)).toBe(true);
    await expect(redeemInviteWithSession(db.sql, second as string, taken)).rejects.toThrow();
    expect(await redeemInviteWithSession(db.sql, second as string, session())).toBe(true);
  });

  it("refuses a code that was never issued, whatever its shape", async () => {
    expect(await redeemInviteWithSession(db.sql, "0000-0000-0000-0000", session())).toBe(false);
    expect(await redeemInviteWithSession(db.sql, "", session())).toBe(false);
  });

  it("stores only a hash: the code is not recoverable from the table", async () => {
    const [code] = await createInvites(db.sql, "hashed", 1);
    const rows = await db.sql<{ code_hash: string }[]>`select code_hash from invites where label = 'hashed'`;
    expect(rows[0]?.code_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(rows)).not.toContain(normalizeInvite(code as string));
  });

  it("counts what was issued and what was used", async () => {
    const stats = await inviteStats(db.sql);
    expect(stats.total).toBeGreaterThanOrEqual(stats.redeemed);
    expect(stats.redeemed).toBeGreaterThanOrEqual(2);
  });
});

describe("sessions", () => {
  it("stop being active when they expire or are revoked, one by one or by invite label", async () => {
    const [a, b, c] = await createInvites(db.sql, "wave 2", 3);
    const sa = session();
    const sb = session();
    const sc = session({ expiresAt: later(-1) });
    for (const [code, s] of [[a, sa], [b, sb], [c, sc]] as const) await redeemInviteWithSession(db.sql, code as string, s);
    const now = new Date();
    expect(await sessionActive(db.sql, sa.sid, now)).toBe(true);
    expect(await sessionActive(db.sql, sc.sid, now)).toBe(false);
    expect(await revokeSession(db.sql, sa.sid)).toBe(true);
    expect(await revokeSession(db.sql, sa.sid)).toBe(false);
    expect(await sessionActive(db.sql, sa.sid, now)).toBe(false);
    expect(await revokeInvites(db.sql, "wave 2")).toBe(1);
    expect(await sessionActive(db.sql, sb.sid, now)).toBe(false);
  });

  it("are not active when the database has never heard of them", async () => {
    expect(await sessionActive(db.sql, randomUUID(), new Date())).toBe(false);
  });
});
