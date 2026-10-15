import { randomBytes } from "node:crypto";
import { money, parsePlainDate } from "@strickle/core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrate } from "../../src/migrate.ts";
import { StaleStateError, createStore } from "../../src/store.ts";
import { createTestDatabase } from "./helpers.ts";

let db: Awaited<ReturnType<typeof createTestDatabase>>;
let store: ReturnType<typeof createStore>;

beforeAll(async () => {
  db = await createTestDatabase();
  await migrate(db.sql);
  store = createStore(db.sql, db.key);
});

afterAll(() => db.drop());

const newUser = () => store.createUser({ homeCountry: "MX", locale: "es" });

describe("mirror balances", () => {
  it("round-trips amounts beyond 2^53 per box and asset, and an update replaces the value", async () => {
    const user = await newUser();
    await store.setMirrorBalance(user, "taxes", money("USDC", 2n ** 70n));
    await store.setMirrorBalance(user, "taxes", money("EURC", 5n));
    await store.setMirrorBalance(user, "salary", money("USDC", 7n));
    await store.setMirrorBalance(user, "taxes", money("USDC", 9n));
    expect(await store.getMirrorBalances(user)).toEqual([
      { kind: "salary", balance: money("USDC", 7n) },
      { kind: "taxes", balance: money("EURC", 5n) },
      { kind: "taxes", balance: money("USDC", 9n) },
    ]);
  });

  it("returns nothing for a user without boxes", async () => {
    expect(await store.getMirrorBalances(await newUser())).toEqual([]);
  });
});

describe("receipts and forecasts", () => {
  it("lists receipts oldest first with their decrypted payload", async () => {
    const user = await newUser();
    const first = await store.addReceipt(user, "split", { total: 100n, parts: [60n, 40n] });
    const second = await store.addReceipt(user, "salary", { paid: 25n });
    const receipts = await store.listReceipts<{ total?: bigint; paid?: bigint }>(user);
    expect(receipts.map((r) => [r.id, r.kind])).toEqual([
      [first, "split"],
      [second, "salary"],
    ]);
    expect(receipts[0]?.payload.total).toBe(100n);
  });

  it("keeps one forecast per day and replaces it on update", async () => {
    const user = await newUser();
    const day = parsePlainDate("2026-10-15");
    expect(await store.getForecast(user, day)).toBeUndefined();
    await store.putForecast(user, day, { low: 1n });
    await store.putForecast(user, day, { low: 2n });
    expect(await store.getForecast(user, day)).toEqual({ low: 2n });
  });
});

describe("agent state", () => {
  it("round-trips and bumps the version on every save", async () => {
    const user = await newUser();
    expect(await store.loadAgentState(user)).toBeUndefined();
    expect(await store.saveAgentState(user, { memory: ["a"], cushion: 10n }, 0)).toBe(1);
    expect(await store.saveAgentState(user, { memory: ["a", "b"], cushion: 11n }, 1)).toBe(2);
    expect(await store.loadAgentState(user)).toEqual({ version: 2, state: { memory: ["a", "b"], cushion: 11n } });
  });

  it("lets exactly one of two concurrent writers win", async () => {
    const user = await newUser();
    const results = await Promise.allSettled([
      store.saveAgentState(user, { writer: 1 }, 0),
      store.saveAgentState(user, { writer: 2 }, 0),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((r): r is PromiseRejectedResult => r.status === "rejected");
    expect(rejected?.reason).toBeInstanceOf(StaleStateError);
  });

  it("rejects a save from a stale version", async () => {
    const user = await newUser();
    await store.saveAgentState(user, { n: 1 }, 0);
    await store.saveAgentState(user, { n: 2 }, 1);
    await expect(store.saveAgentState(user, { n: 3 }, 1)).rejects.toBeInstanceOf(StaleStateError);
    await expect(store.saveAgentState(user, { n: 3 }, 0)).rejects.toBeInstanceOf(StaleStateError);
  });

  it("cannot be read with another key", async () => {
    const user = await newUser();
    await store.saveAgentState(user, { secret: 1n }, 0);
    await expect(createStore(db.sql, randomBytes(32)).loadAgentState(user)).rejects.toThrow();
  });

  it("cannot be read after being copied into another user's row", async () => {
    const a = await newUser();
    const b = await newUser();
    await store.saveAgentState(a, { owner: "a" }, 0);
    await store.saveAgentState(b, { owner: "b" }, 0);
    await db.sql`update agent_state set state = (select state from agent_state where user_id = ${a}) where user_id = ${b}`;
    await expect(store.loadAgentState(b)).rejects.toThrow();
  });

  it("is removed together with its user", async () => {
    const user = await newUser();
    await store.saveAgentState(user, { n: 1 }, 0);
    await db.sql`delete from users where id = ${user}`;
    expect(await store.loadAgentState(user)).toBeUndefined();
  });
});
