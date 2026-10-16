import { createInvites, createLimiter, migrate, redeemInviteWithSession, revokeInvites, sessionActive } from "@strickle/db";
import { createTestDatabase } from "@strickle/db/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ACCESS_COOKIE, createSessionChecker, readAccess } from "../../src/server/access.ts";
import { handleAccess } from "../../src/server/access-handler.ts";

let db: Awaited<ReturnType<typeof createTestDatabase>>;
beforeAll(async () => {
  db = await createTestDatabase();
  await migrate(db.sql);
});
afterAll(() => db.drop());

const SECRET = "s".repeat(40);
const env = { ACCESS_MODE: "invite", ACCESS_COOKIE_SECRET: SECRET, RELAY_IP_PEPPER: "pepper" };
const now = () => Math.floor(Date.now() / 1000);
const post = (code: string, ip = "203.0.113.7") => new Request("https://app.test/api/access", { method: "POST", headers: { "x-forwarded-for": ip }, body: new URLSearchParams({ code, lang: "en" }) });
const deps = () => ({
  env,
  now: now(),
  redeem: (code: string, session: { sid: string; expiresAt: Date }) => redeemInviteWithSession(db.sql, code, session),
  attempts: createLimiter(db.sql),
});

describe("the invite flow against a real database", () => {
  it("lets a real code in once, keeps everyone else out and ties the cookie to its invite", async () => {
    const [code] = await createInvites(db.sql, "integration", 1);
    const first = await handleAccess(post(code as string), deps());
    const second = await handleAccess(post(code as string), deps());
    const cookie = first.headers.getSetCookie()[0] ?? "";
    expect(cookie).toContain(`${ACCESS_COOKIE}=`);
    expect(second.headers.get("set-cookie")).toBeNull();
    expect(second.headers.get("location")).toContain("/en/access/invalid");

    const value = cookie.split(`${ACCESS_COOKIE}=`)[1]?.split(";")[0] as string;
    const session = readAccess(SECRET, value, now());
    expect(session).toBeDefined();
    const checker = createSessionChecker((sid) => sessionActive(db.sql, sid, new Date()), { ttlMs: 0 });
    expect(await checker.state((session as { sid: string }).sid)).toBe("active");

    await revokeInvites(db.sql, "integration");
    expect(await checker.state((session as { sid: string }).sid)).toBe("revoked");
  });

  it("slows a guesser down: after ten wrong codes from one address the eleventh is not even read", async () => {
    const attempts = [];
    for (let i = 0; i < 11; i++) attempts.push(await handleAccess(post(`WRONG-${i}`, "198.51.100.9"), deps()));
    expect(attempts.slice(0, 10).every((response) => response.headers.get("location")?.endsWith("/en/access/invalid"))).toBe(true);
    expect(attempts[10]?.headers.get("location")).toContain("/en/access/slow");
    const [code] = await createInvites(db.sql, "slow", 1);
    expect((await handleAccess(post(code as string, "198.51.100.9"), deps())).headers.get("location")).toContain("/en/access/slow");
    expect((await handleAccess(post(code as string, "198.51.100.10"), deps())).headers.get("set-cookie")).not.toBeNull();
  });
});
