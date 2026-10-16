import { createLimiter } from "@strickle/db/limiter";
import { createTestDatabase } from "@strickle/db/testing";
import { migrate } from "@strickle/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type DepositDeps, handleCreateDeposit, handleDepositRead, handleDepositUpdate } from "../../src/server/deposits.ts";

const VAULT = "0x8AB41267Adc223EF245c46537870Ae8744b9b3F8";
const SENDER = "0x14b5e469720A4cb071772258D9ac8f0B37Ab8D9A";
const URL_ = "http://localhost:3200/api/deposits";
const UNKNOWN = `0x${"11".repeat(20)}`;
const LIMIT_VAULT = `0x${"77".repeat(20)}`;
let db: Awaited<ReturnType<typeof createTestDatabase>>;
let deps: DepositDeps;

beforeAll(async () => {
  db = await createTestDatabase();
  await migrate(db.sql);
  deps = {
    env: { RELAY_IP_PEPPER: "p".repeat(32) },
    sql: db.sql,
    limiter: createLimiter(db.sql),
    network: "testnet",
    guard: { vault: async (v) => ({ registered: v.toLowerCase() !== UNKNOWN, hasState: true, paused: false }) },
    access: async () => "allow",
    burn: async () => ({ status: "pending_confirmations", forwardState: null, forwardTxHash: null, amount: 25_000_000n, feeExecuted: 0n, sourceDomain: 6, destinationDomain: 26, appliedSpeed: null }),
    burnSender: async () => SENDER as `0x${string}`,
    track: async () => ({ state: "waiting" }),
  };
});
afterAll(async () => db.drop());

const post = (body: unknown, headers: Record<string, string> = { origin: "http://localhost:3200" }) => new Request(URL_, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });
const valid = { vault: VAULT, sourceChain: "Base_Sepolia", sourceAddress: SENDER, amount: "25000000", speed: "fast", feeMode: "source", intent: "income" };

describe("POST /api/deposits", () => {
  it("creates a record for a registered vault and a listed chain", async () => {
    const { status, body } = await handleCreateDeposit(post(valid), deps);
    expect(status).toBe(201);
    expect(body).toMatchObject({ status: "created" });
  });
  it("requires the same origin", async () => {
    expect((await handleCreateDeposit(post(valid, { origin: "https://evil.example" }), deps)).status).toBe(400);
    expect((await handleCreateDeposit(post(valid, {}), deps)).status).toBe(400);
  });
  it("rejects a chain that is not offered, a bad amount and an unknown intent", async () => {
    for (const bad of [{ ...valid, sourceChain: "Ethereum" }, { ...valid, amount: "0" }, { ...valid, amount: "1.5" }, { ...valid, intent: "gift" }, { ...valid, vault: "0x1" }]) {
      expect((await handleCreateDeposit(post(bad), deps)).status).toBe(400);
    }
  });
  it("does not record a deposit for a vault the agent does not know", async () => {
    expect((await handleCreateDeposit(post({ ...valid, vault: UNKNOWN }), deps)).status).toBe(404);
  });
  it("closes when access is denied or the database is unreachable", async () => {
    expect((await handleCreateDeposit(post(valid), { ...deps, access: async () => "deny" })).status).toBe(400);
    expect((await handleCreateDeposit(post(valid), { ...deps, access: async () => "closed" })).status).toBe(503);
  });
  it("limits creations per vault", async () => {
    const results = [];
    // a vault of its own: the counter is per vault and counts every attempt, so the other tests must not share it
    for (let i = 0; i < 12; i++) results.push((await handleCreateDeposit(post({ ...valid, vault: LIMIT_VAULT }, { origin: "http://localhost:3200", "x-forwarded-for": `10.4.0.${i}` }), deps)).status);
    expect(results).toContain(429);
  });
});

describe("recording the burn and reading the deposit", () => {
  it("records a burn Iris knows about for the Arc domain, once", async () => {
    const created = (await handleCreateDeposit(post(valid, { origin: "http://localhost:3200", "x-forwarded-for": "10.0.0.9" }), { ...deps, limiter: createLimiter(db.sql) })).body;
    if (created.status !== "created") throw new Error("setup");
    const burnTx = `0x${"ab".repeat(32)}`;
    const update = (tx: string) => handleDepositUpdate(new Request(`${URL_}/${created.id}`, { method: "POST", headers: { origin: "http://localhost:3200", "content-type": "application/json" }, body: JSON.stringify({ burnTx: tx }) }), created.id, deps);
    expect((await update(burnTx)).status).toBe(200);
    expect((await update(burnTx)).status).toBe(200); // idempotent for the same hash
    expect((await update(`0x${"cd".repeat(32)}`)).body).toMatchObject({ status: "rejected" }); // a different hash for the same deposit
  });
  it("refuses a burn sent by someone other than the declared depositor, a burn of another amount, and a hash another deposit already holds", async () => {
    const make = async (ip: string) => {
      const created = (await handleCreateDeposit(post(valid, { origin: "http://localhost:3200", "x-forwarded-for": ip }), deps)).body;
      if (created.status !== "created") throw new Error("setup");
      return created.id;
    };
    const update = (id: string, tx: string, over: Partial<DepositDeps> = {}) => handleDepositUpdate(new Request(`${URL_}/${id}`, { method: "POST", headers: { origin: "http://localhost:3200", "content-type": "application/json" }, body: JSON.stringify({ burnTx: tx }) }), id, { ...deps, ...over });
    const stranger = `0x${"99".repeat(20)}`;
    expect((await update(await make("10.0.1.1"), `0x${"a1".repeat(32)}`, { burnSender: async () => stranger as `0x${string}` })).body).toMatchObject({ status: "rejected" });
    expect((await update(await make("10.0.1.2"), `0x${"a2".repeat(32)}`, { burn: async () => ({ status: "complete", forwardState: null, forwardTxHash: null, amount: 1n, feeExecuted: 0n, sourceDomain: 6, destinationDomain: 26, appliedSpeed: null }) })).body).toMatchObject({ status: "rejected" });
    const first = await make("10.0.1.3");
    expect((await update(first, `0x${"a3".repeat(32)}`)).status).toBe(200);
    const second = await make("10.0.1.4");
    expect((await update(second, `0x${"a3".repeat(32)}`)).body).toEqual({ status: "conflict" });
    expect((await update(await make("10.0.1.5"), `0x${"a4".repeat(32)}`, { burn: async () => null })).body).toMatchObject({ status: "rejected", retryAfterSeconds: 5 });
  });
  it("refuses a burn Iris says is not headed to Arc", async () => {
    const created = (await handleCreateDeposit(post(valid, { origin: "http://localhost:3200", "x-forwarded-for": "10.0.0.10" }), deps)).body;
    if (created.status !== "created") throw new Error("setup");
    const wrongWay = { ...deps, burn: async () => ({ status: "complete" as const, forwardState: null, forwardTxHash: null, amount: 25_000_000n, feeExecuted: 0n, sourceDomain: 6, destinationDomain: 6, appliedSpeed: null }) };
    const result = await handleDepositUpdate(new Request(`${URL_}/${created.id}`, { method: "POST", headers: { origin: "http://localhost:3200", "content-type": "application/json" }, body: JSON.stringify({ burnTx: `0x${"ee".repeat(32)}` }) }), created.id, wrongWay);
    expect(result.body).toMatchObject({ status: "rejected" });
  });
  it("shows the state, never the declared intent, and records the arrival the chain proves", async () => {
    const created = (await handleCreateDeposit(post(valid, { origin: "http://localhost:3200", "x-forwarded-for": "10.0.0.11" }), deps)).body;
    if (created.status !== "created") throw new Error("setup");
    await handleDepositUpdate(new Request(`${URL_}/${created.id}`, { method: "POST", headers: { origin: "http://localhost:3200", "content-type": "application/json" }, body: JSON.stringify({ burnTx: `0x${"f1".repeat(32)}` }) }), created.id, deps);
    const arrived = { ...deps, track: async () => ({ state: "arrived" as const, forwardTx: `0x${"f2".repeat(32)}` as const, received: 25_000_000n, payer: SENDER as `0x${string}`, logIndex: 3, at: new Date() }) };
    const read = await handleDepositRead(new Request(`${URL_}/${created.id}`), created.id, arrived);
    expect(read.body).toMatchObject({ status: "ok", deposit: { state: "arrived", received: "25000000" } });
    expect(JSON.stringify(read.body)).not.toContain("income");
    expect((await handleDepositRead(new Request(`${URL_}/${created.id}`), created.id, arrived)).body).toMatchObject({ status: "ok", deposit: { state: "arrived" } });
  });
  it("answers not-found for an unknown or malformed id", async () => {
    expect((await handleDepositRead(new Request(`${URL_}/nope`), "nope", deps)).status).toBe(404);
  });
});
