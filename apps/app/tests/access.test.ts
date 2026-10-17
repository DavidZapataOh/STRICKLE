import { describe, expect, it } from "vitest";
import { accessMode, createSessionChecker, decide, isApiPath, isPublicPath, mintAccess, readAccess, safeNext } from "../src/server/access.ts";

const SECRET = "s".repeat(40);
const NOW = 1_800_000_000;
const SID = "11111111-2222-4333-8444-555555555555";

describe("accessMode", () => {
  it("defaults to open off mainnet and refuses to guess on mainnet", () => {
    expect(accessMode({})).toBe("open");
    expect(() => accessMode({ NEXT_PUBLIC_APP_NETWORK: "mainnet" })).toThrow(/ACCESS_MODE must be set/);
    expect(accessMode({ NEXT_PUBLIC_APP_NETWORK: "mainnet", ACCESS_MODE: "invite" })).toBe("invite");
    expect(() => accessMode({ ACCESS_MODE: "maybe" })).toThrow();
  });
});

describe("the access cookie", () => {
  it("verifies while it is fresh, carries its session and stops at its expiry", () => {
    const value = mintAccess(SECRET, SID, NOW + 60);
    expect(readAccess(SECRET, value, NOW)).toEqual({ sid: SID, expiresAt: NOW + 60 });
    expect(readAccess(SECRET, value, NOW + 61)).toBeUndefined();
  });

  it("cannot be forged, extended, moved to another session or read with another secret", () => {
    const [sid, expires, mac] = mintAccess(SECRET, SID, NOW + 60).split(".");
    expect(readAccess(SECRET, `${sid}.${NOW + 999_999}.${mac}`, NOW)).toBeUndefined();
    expect(readAccess(SECRET, `11111111-2222-4333-8444-555555555556.${expires}.${mac}`, NOW)).toBeUndefined();
    expect(readAccess("x".repeat(40), mintAccess(SECRET, SID, NOW + 60), NOW)).toBeUndefined();
    expect(readAccess(SECRET, undefined, NOW)).toBeUndefined();
    expect(readAccess(SECRET, "garbage", NOW)).toBeUndefined();
    expect(readAccess(SECRET, `not-a-uuid.${expires}.${mac}`, NOW)).toBeUndefined();
  });

  it("needs a real secret", () => {
    expect(() => mintAccess("short", SID, NOW)).toThrow(/at least 32/);
  });
});

describe("what is public", () => {
  it("lists the pages and the routes every mode lets through", () => {
    for (const path of ["/en/access", "/en/access/invalid", "/en/closed", "/en/verify", "/es/docs", "/es/metrics", "/pt-br/view/0xabc", "/pt-br/accountant", "/en/unavailable", "/api/access", "/api/metrics", "/api/logs", "/api/pool-notes"]) expect(isPublicPath(path), path).toBe(true);
    for (const path of ["/en", "/en/boxes", "/en/activity", "/en/settings", "/en/start", "/api/agent-action", "/api/anything"]) expect(isPublicPath(path), path).toBe(false);
  });

  it("lets Circle's notifications through without an invite, and nothing else under /api/webhooks", () => {
    expect(isPublicPath("/api/webhooks/circle")).toBe(true);
    for (const path of ["/api/webhooks", "/api/webhooks/other", "/api/webhooks/circle/extra"]) expect(isPublicPath(path), path).toBe(false);
  });

  it("tells API routes from pages", () => {
    expect(isApiPath("/api/logs")).toBe(true);
    expect(isApiPath("/en/api")).toBe(false);
  });
});

describe("decide", () => {
  const page = "/pt-br/boxes";
  const api = "/api/agent-action";

  it("does nothing when the app is open", () => {
    expect(decide({ pathname: page, mode: "open", session: "missing" })).toEqual({ kind: "allow" });
    expect(decide({ pathname: api, mode: "open", session: "missing" })).toEqual({ kind: "allow" });
  });

  it("closed: pages go to the maintenance page and every API route answers 503, valid cookie or not", () => {
    expect(decide({ pathname: page, mode: "closed", session: "active" })).toEqual({ kind: "redirect", page: "closed" });
    expect(decide({ pathname: api, mode: "closed", session: "active" })).toEqual({ kind: "api", status: 503, error: "closed" });
    expect(decide({ pathname: "/api/anything", mode: "closed", session: "missing" })).toEqual({ kind: "api", status: 503, error: "closed" });
  });

  it("closed still lets the public set through", () => {
    for (const pathname of ["/en/closed", "/en/metrics", "/api/metrics", "/api/logs", "/api/pool-notes"]) expect(decide({ pathname, mode: "closed", session: "missing" })).toEqual({ kind: "allow" });
  });

  it("invite: an active session passes, everything else is sent to the access page or refused with 401", () => {
    expect(decide({ pathname: page, mode: "invite", session: "active" })).toEqual({ kind: "allow" });
    for (const session of ["missing", "invalid", "revoked"] as const) {
      expect(decide({ pathname: page, mode: "invite", session })).toEqual({ kind: "redirect", page: "access", remember: true });
      expect(decide({ pathname: api, mode: "invite", session })).toEqual({ kind: "api", status: 401, error: "access-required" });
    }
  });

  it("invite: when the session store cannot answer, fail closed", () => {
    expect(decide({ pathname: page, mode: "invite", session: "unknown" })).toEqual({ kind: "redirect", page: "closed" });
    expect(decide({ pathname: api, mode: "invite", session: "unknown" })).toEqual({ kind: "api", status: 503, error: "unavailable" });
  });

  it("invite: the public set is open to everyone", () => {
    for (const pathname of ["/en/access", "/en/verify", "/api/access", "/api/metrics", "/api/logs"]) expect(decide({ pathname, mode: "invite", session: "missing" })).toEqual({ kind: "allow" });
  });
});

describe("safeNext", () => {
  it("keeps a local path of the same language and refuses everything that could leave the site", () => {
    expect(safeNext("/en/start?amount=3200&country=CO", "en")).toBe("/en/start?amount=3200&country=CO");
    expect(safeNext("/pt-br/boxes", "pt-br")).toBe("/pt-br/boxes");
    for (const bad of ["https://evil.example", "//evil.example", "/\\evil.example", "/api/agent-action", "/en/access", "/fr/boxes", "boxes", "/en/\u0000x", `/en/${"a".repeat(600)}`, undefined, ""]) {
      expect(safeNext(bad, "en"), String(bad)).toBe("/en");
    }
  });
});

describe("createSessionChecker", () => {
  // The database is injected: the real queries are covered by the integration test against Postgres.
  const source = (answers: Record<string, boolean>, calls: string[] = [], down = { on: false }) => async (sid: string) => {
    calls.push(sid);
    if (down.on) throw new Error("connection refused");
    return answers[sid] ?? false;
  };

  it("maps the store's answer and caches it for the time to live", async () => {
    const calls: string[] = [];
    let now = 1_000;
    const checker = createSessionChecker(source({ a: true, b: false }, calls), { ttlMs: 30_000, staleMs: 300_000, now: () => now });
    expect(await checker.state("a")).toBe("active");
    expect(await checker.state("b")).toBe("revoked");
    expect(await checker.state("a")).toBe("active");
    expect(calls).toEqual(["a", "b"]);
    now += 31_000;
    expect(await checker.state("a")).toBe("active");
    expect(calls).toEqual(["a", "b", "a"]);
  });

  it("keeps the last answer while the store is down, for a while, then fails closed", async () => {
    let now = 1_000;
    const down = { on: false };
    const checker = createSessionChecker(source({ a: true }, [], down), { ttlMs: 30_000, staleMs: 300_000, now: () => now });
    expect(await checker.state("a")).toBe("active");
    down.on = true;
    now += 60_000;
    expect(await checker.state("a")).toBe("active");
    now += 300_001;
    expect(await checker.state("a")).toBe("unknown");
    expect(await checker.state("never-seen")).toBe("unknown");
  });

  it("without a store there is no way to know", async () => {
    expect(await createSessionChecker(undefined).state("a")).toBe("unknown");
  });
});
