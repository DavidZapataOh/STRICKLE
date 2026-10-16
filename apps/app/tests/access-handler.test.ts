import { describe, expect, it } from "vitest";
import { ACCESS_COOKIE, NEXT_COOKIE } from "../src/server/access.ts";
import { type AccessDeps, handleAccess } from "../src/server/access-handler.ts";

const SECRET = "s".repeat(40);
const NOW = 1_800_000_000;
const env = { ACCESS_MODE: "invite", ACCESS_COOKIE_SECRET: SECRET, RELAY_IP_PEPPER: "pepper" };

const post = (code: string, lang = "en", cookie?: string) =>
  new Request("https://app.test/api/access", {
    method: "POST",
    headers: { "x-forwarded-for": "203.0.113.7", ...(cookie ? { cookie } : {}) },
    body: new URLSearchParams({ code, lang }),
  });

// The invite store is injected here (the real one is in the integration test): the point is what the handler does around it.
const deps = (overrides: Partial<AccessDeps> = {}) => {
  const redeemed: { code: string; sid: string }[] = [];
  const value: AccessDeps = {
    env,
    now: NOW,
    randomId: () => "11111111-2222-4333-8444-555555555555",
    redeem: async (code, session) => {
      redeemed.push({ code, sid: session.sid });
      return code === "GOOD";
    },
    ...overrides,
  };
  return { value, redeemed };
};

describe("handleAccess", () => {
  it("sets a signed, HTTP-only cookie bound to its session and lands on Home when the code is good", async () => {
    const { value, redeemed } = deps();
    const response = await handleAccess(post("GOOD", "es"), value);
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("https://app.test/es");
    const cookie = response.headers.getSetCookie()[0] ?? "";
    expect(cookie).toContain(`${ACCESS_COOKIE}=11111111-2222-4333-8444-555555555555.${NOW + 30 * 24 * 60 * 60}.`);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
    expect(cookie).toMatch(/Secure/i);
    expect(redeemed).toEqual([{ code: "GOOD", sid: "11111111-2222-4333-8444-555555555555" }]);
  });

  it("returns the visitor to the page they came from, but only if it is a local page", async () => {
    const response = await handleAccess(post("GOOD", "en", `${NEXT_COOKIE}=${encodeURIComponent("/en/start?amount=3200")}`), deps().value);
    expect(response.headers.get("location")).toBe("https://app.test/en/start?amount=3200");
    const evil = await handleAccess(post("GOOD", "en", `${NEXT_COOKIE}=${encodeURIComponent("https://evil.example")}`), deps().value);
    expect(evil.headers.get("location")).toBe("https://app.test/en");
  });

  it("sends a bad code back with no cookie", async () => {
    const response = await handleAccess(post("nope"), deps().value);
    expect(response.headers.get("location")).toBe("https://app.test/en/access/invalid");
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("ignores a language it does not serve", async () => {
    expect((await handleAccess(post("x", "fr"), deps().value)).headers.get("location")).toBe("https://app.test/en/access/invalid");
  });

  it("never burns a code when the secret is too short to sign a cookie", async () => {
    const { value, redeemed } = deps({ env: { ...env, ACCESS_COOKIE_SECRET: "short" } });
    const response = await handleAccess(post("GOOD"), value);
    expect(response.headers.get("location")).toBe("https://app.test/en/access/error");
    expect(redeemed).toEqual([]);
  });

  it("fails closed, without burning anything, when the pepper is missing", async () => {
    const { value, redeemed } = deps({ env: { ACCESS_MODE: "invite", ACCESS_COOKIE_SECRET: SECRET } });
    expect((await handleAccess(post("GOOD"), value)).headers.get("location")).toBe("https://app.test/en/access/error");
    expect(redeemed).toEqual([]);
  });

  it("answers an error page, not a crash, when the store fails", async () => {
    const { value } = deps({ redeem: async () => { throw new Error("connection refused"); } });
    expect((await handleAccess(post("GOOD"), value)).headers.get("location")).toBe("https://app.test/en/access/error");
  });

  it("slows a guesser down before it reads the code", async () => {
    const { value, redeemed } = deps({ attempts: { count: async () => ({ allowed: false, retryAfterSeconds: 300 }) } });
    const response = await handleAccess(post("GOOD"), value);
    expect(response.headers.get("location")).toBe("https://app.test/en/access/slow");
    expect(redeemed).toEqual([]);
  });

  it("sends everyone to the maintenance page when closed and has nothing to redeem when open", async () => {
    expect((await handleAccess(post("GOOD"), deps({ env: { ...env, ACCESS_MODE: "closed" } }).value)).headers.get("location")).toBe("https://app.test/en/closed");
    expect((await handleAccess(post("GOOD"), deps({ env: { ...env, ACCESS_MODE: "open" } }).value)).headers.get("location")).toBe("https://app.test/en");
  });
});
