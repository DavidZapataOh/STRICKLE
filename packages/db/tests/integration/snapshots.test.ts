import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrate } from "../../src/migrate.ts";
import { latestSnapshot, saveSnapshot } from "../../src/snapshots.ts";
import { createTestDatabase } from "../../src/testing.ts";

let db: Awaited<ReturnType<typeof createTestDatabase>>;
beforeAll(async () => {
  db = await createTestDatabase();
  await migrate(db.sql);
});
afterAll(() => db.drop());

describe("metric snapshots", () => {
  it("has nothing until something is recorded", async () => {
    expect(await latestSnapshot(db.sql, "mainnet")).toBeUndefined();
  });

  it("returns the newest snapshot of a network with its payload and its resume state, and keeps the networks apart", async () => {
    await saveSnapshot(db.sql, { network: "mainnet", asOfBlock: 10n, payload: { n: 1 }, state: { cursor: 10 } });
    await saveSnapshot(db.sql, { network: "mainnet", asOfBlock: 20n, payload: { n: 2 }, state: { cursor: 20 } });
    await saveSnapshot(db.sql, { network: "testnet", asOfBlock: 99n, payload: { n: 3 }, state: { cursor: 99 } });
    const newest = await latestSnapshot(db.sql, "mainnet");
    expect(newest?.payload).toEqual({ n: 2 });
    expect(newest?.state).toEqual({ cursor: 20 });
    expect((await latestSnapshot(db.sql, "testnet"))?.asOfBlock).toBe(99n);
  });

  it("refuses a network it does not know", async () => {
    await expect(saveSnapshot(db.sql, { network: "devnet" as never, asOfBlock: 1n, payload: {}, state: {} })).rejects.toThrow();
  });
});
