import { describe, expect, it } from "vitest";
import { type RelayDeps, handleRelay, statusCodeFor } from "../src/server/relay.ts";

const vault = "0x00000000000000000000000000000000000000a1";
const workflow = `0x${"cd".repeat(32)}` as const;
const envelope = { vault, sealed: `0x${"ab".repeat(80)}` };
const env = { CRE_GATEWAY_KEY: `0x${"02".repeat(32)}`, CRE_GATEWAY_URL: "https://gateway.test", CRE_WORKFLOW_ID: workflow, RELAY_IP_PEPPER: "pepper" };

const request = (body: unknown, headers: Record<string, string> = {}) =>
  new Request("https://app.test/api/agent-action", { method: "POST", headers: { origin: "https://app.test", "x-forwarded-for": "203.0.113.7", ...headers }, body: typeof body === "string" ? body : JSON.stringify(body) });

// A limiter with the same contract as the Postgres one, so the relay's decisions can be tested without a database;
// the Postgres implementation itself is tested against a real database in packages/db.
function memoryLimiter(now: () => number) {
  const counters = new Map<string, { start: number; hits: number }>();
  const slots = new Map<string, { at: number; token: string }>();
  let n = 0;
  return {
    async count(key: string, windowSeconds: number, limit: number) {
      const c = counters.get(key);
      const fresh = !c || now() - c.start >= windowSeconds * 1000;
      const next = fresh ? { start: now(), hits: 1 } : { start: c.start, hits: c.hits + 1 };
      counters.set(key, next);
      return { allowed: next.hits <= limit, retryAfterSeconds: Math.max(1, Math.ceil((next.start + windowSeconds * 1000 - now()) / 1000)) };
    },
    async claimSlot(key: string, intervalSeconds: number) {
      const s = slots.get(key);
      if (s && now() - s.at < intervalSeconds * 1000) return { claimed: false as const, retryAfterSeconds: Math.max(1, Math.ceil((s.at + intervalSeconds * 1000 - now()) / 1000)) };
      const token = String(++n);
      slots.set(key, { at: now(), token });
      return { claimed: true as const, token };
    },
    async releaseSlot(key: string, token: string) {
      if (slots.get(key)?.token === token) slots.delete(key);
    },
  };
}

function deps(overrides: Partial<RelayDeps> = {}) {
  let clock = 1_000_000;
  const forwarded: unknown[] = [];
  const base: RelayDeps = {
    env,
    limiter: memoryLimiter(() => clock),
    chain: { vault: async () => ({ registered: true, hasState: true, paused: false }), expectedWorkflowId: async () => workflow },
    gateway: async (item) => (forwarded.push(item), "accepted"),
    access: async () => "allow",
    ...overrides,
  };
  return { deps: base, forwarded, tick: (ms: number) => (clock += ms) };
}

describe("handleRelay", () => {
  it("forwards a well-formed envelope for a registered vault and answers accepted", async () => {
    const { deps: d, forwarded } = deps();
    expect(await handleRelay(request(envelope), d)).toEqual({ status: 202, body: { status: "accepted" } });
    expect(forwarded).toEqual([envelope]);
  });

  it("requires the browser's own origin, a small JSON body and a sealed envelope before anything else", async () => {
    const { deps: d, forwarded } = deps();
    expect((await handleRelay(request(envelope, { origin: "https://evil.test" }), d)).status).toBe(400);
    const noOrigin = new Request("https://app.test/api/agent-action", { method: "POST", body: JSON.stringify(envelope) });
    expect((await handleRelay(noOrigin, d)).status).toBe(400);
    expect((await handleRelay(request("x".repeat(20_001)), d)).status).toBe(400);
    expect((await handleRelay(request("not json"), d)).status).toBe(400);
    for (const bad of [{}, { vault: "nope", sealed: "0x12" }, { ...envelope, action: { kind: "approve" } }]) expect((await handleRelay(request(bad), d)).status).toBe(400);
    expect(forwarded).toHaveLength(0);
  });

  it("stops a visitor the access gate refuses, and answers 503 while access is closed", async () => {
    const closed = deps({ access: async () => "closed" });
    expect(await handleRelay(request(envelope), closed.deps)).toEqual({ status: 503, body: { status: "closed" } });
    const denied = deps({ access: async () => "deny" });
    expect((await handleRelay(request(envelope), denied.deps)).body.status).toBe("rejected");
    expect(closed.forwarded.length + denied.forwarded.length).toBe(0);
  });

  it("refuses to run with a workflow ID that is not the one the executor expects on chain", async () => {
    const stale = deps({ chain: { vault: async () => ({ registered: true, hasState: true, paused: false }), expectedWorkflowId: async () => `0x${"ee".repeat(32)}` } });
    expect(await handleRelay(request(envelope), stale.deps)).toEqual({ status: 503, body: { status: "misconfigured" } });
    expect(stale.forwarded).toHaveLength(0);
  });

  it("is misconfigured without the key, the URL, the workflow or the pepper", async () => {
    for (const missing of ["CRE_GATEWAY_KEY", "CRE_GATEWAY_URL", "CRE_WORKFLOW_ID", "RELAY_IP_PEPPER"]) {
      const { deps: d } = deps({ env: { ...env, [missing]: undefined } });
      expect((await handleRelay(request(envelope), d)).body.status).toBe("misconfigured");
    }
    expect((await handleRelay(request(envelope), deps({ env: { ...env, CRE_GATEWAY_KEY: "nope" } }).deps)).body.status).toBe("misconfigured");
  });

  it("refuses a vault the executor does not know, one without state, and one that is paused, without touching the gateway", async () => {
    const cases = [
      [{ registered: false, hasState: false, paused: false }, 404, "unknown-vault"],
      [{ registered: true, hasState: false, paused: false }, 404, "unknown-vault"],
      [{ registered: true, hasState: true, paused: true }, 409, "paused"],
    ] as const;
    for (const [state, status, name] of cases) {
      const { deps: d, forwarded } = deps({ chain: { vault: async () => state, expectedWorkflowId: async () => workflow } });
      expect(await handleRelay(request(envelope), d)).toEqual({ status, body: { status: name } });
      expect(forwarded).toHaveLength(0);
    }
  });

  it("allows a vault one accepted request every 30 seconds and tells the caller when to retry", async () => {
    const { deps: d, forwarded, tick } = deps();
    expect((await handleRelay(request(envelope), d)).status).toBe(202);
    const second = await handleRelay(request(envelope), d);
    expect(second.status).toBe(429);
    expect(second.body).toEqual({ status: "busy", retryAfterSeconds: 30 });
    tick(31_000);
    expect((await handleRelay(request(envelope), d)).status).toBe(202);
    expect(forwarded).toHaveLength(2);
  });

  it("shares the gateway's one request per 30 seconds between vaults, and gives a vault back its own slot when the gateway is busy", async () => {
    const { deps: d, forwarded } = deps();
    const other = { vault: "0x00000000000000000000000000000000000000b2", sealed: envelope.sealed };
    expect((await handleRelay(request(envelope), d)).status).toBe(202);
    const refused = await handleRelay(request(other), d);
    expect(refused.status).toBe(429);
    expect(forwarded).toHaveLength(1);
  });

  it("does not charge a refused request: when the gateway says busy or rejects, both slots are released", async () => {
    let answer: "busy" | "accepted" = "busy";
    const { deps: d } = deps({ gateway: async () => answer });
    expect((await handleRelay(request(envelope), d)).body.status).toBe("busy");
    answer = "accepted";
    expect((await handleRelay(request(envelope), d)).status).toBe(202);
  });

  it("limits one address to twenty requests a minute and stores only a keyed hash of it", async () => {
    const seenKeys: string[] = [];
    const limiter = memoryLimiter(() => 1_000_000);
    const spy = { ...limiter, count: async (key: string, w: number, l: number) => (seenKeys.push(key), limiter.count(key, w, l)) };
    const { deps: d } = deps({ limiter: spy, chain: { vault: async () => ({ registered: false, hasState: false, paused: false }), expectedWorkflowId: async () => workflow } });
    const answers = [];
    for (let i = 0; i < 21; i++) answers.push((await handleRelay(request(envelope), d)).body.status);
    expect(answers.slice(0, 20).every((status) => status === "unknown-vault")).toBe(true);
    expect(answers[20]).toBe("rate-limited");
    expect(seenKeys.every((key) => /^ip:[0-9a-f]{64}$/.test(key))).toBe(true);
    expect(seenKeys.join("")).not.toContain("203.0.113.7");
  });

  it("fails closed when the database or the chain cannot be reached", async () => {
    const downDb = deps({ limiter: { count: async () => { throw new Error("db down"); }, claimSlot: async () => { throw new Error("db down"); }, releaseSlot: async () => undefined } });
    expect((await handleRelay(request(envelope), downDb.deps)).body.status).toBe("unavailable");
    const downChain = deps({ chain: { vault: async () => { throw new Error("rpc down"); }, expectedWorkflowId: async () => workflow } });
    expect((await handleRelay(request(envelope), downChain.deps)).body.status).toBe("unavailable");
    expect(downDb.forwarded.length + downChain.forwarded.length).toBe(0);
  });
});

describe("statusCodeFor", () => {
  it("maps each outcome to its HTTP status", () => {
    const statuses = ["accepted", "busy", "rate-limited", "rejected", "paused", "unknown-vault", "closed", "unavailable", "misconfigured"] as const;
    expect(statuses.map((status) => statusCodeFor({ status }))).toEqual([202, 429, 429, 400, 409, 404, 503, 502, 503]);
  });
});
