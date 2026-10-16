import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrate } from "../../src/migrate.ts";
import { createDeposit, failDeposit, getDeposit, recordArrival, recordBurn } from "../../src/deposits.ts";
import { createTestDatabase } from "../../src/testing.ts";

const VAULT = `0x${"ab".repeat(20)}`;
const SENDER = `0x${"cd".repeat(20)}`;
const TX = (n: number) => `0x${n.toString(16).padStart(64, "0")}`;
let db: Awaited<ReturnType<typeof createTestDatabase>>;

beforeAll(async () => {
  db = await createTestDatabase();
  await migrate(db.sql);
});
afterAll(async () => db.drop());

const input = { vault: VAULT, sourceChain: "Base_Sepolia", sourceAddress: SENDER, amount: 25_000_000n, speed: "fast" as const, feeMode: "source" as const, intent: "income" as const };

describe("deposit records", () => {
  it("move forward only: created, burned, arrived", async () => {
    const id = await createDeposit(db.sql, input);
    expect((await getDeposit(db.sql, id))?.status).toBe("created");
    expect(await recordBurn(db.sql, id, TX(1))).toBe(true);
    expect(await recordBurn(db.sql, id, TX(1))).toBe(false); // already burned
    expect(await recordArrival(db.sql, id, { forwardTx: TX(2), received: 25_000_000n })).toBe(true);
    expect(await recordArrival(db.sql, id, { forwardTx: TX(2), received: 25_000_000n })).toBe(false);
    const row = await getDeposit(db.sql, id);
    expect(row).toMatchObject({ status: "arrived", burnTx: TX(1), forwardTx: TX(2), received: 25_000_000n, amount: 25_000_000n });
  });

  it("cannot arrive without a burn, and cannot fail once arrived", async () => {
    const id = await createDeposit(db.sql, input);
    expect(await recordArrival(db.sql, id, { forwardTx: TX(3), received: 1n })).toBe(false);
    await recordBurn(db.sql, id, TX(4));
    await recordArrival(db.sql, id, { forwardTx: TX(5), received: 1n });
    expect(await failDeposit(db.sql, id, "late")).toBe(false);
    expect((await getDeposit(db.sql, id))?.status).toBe("arrived");
  });

  it("one burn belongs to one deposit", async () => {
    const a = await createDeposit(db.sql, input);
    const b = await createDeposit(db.sql, input);
    expect(await recordBurn(db.sql, a, TX(6))).toBe(true);
    await expect(recordBurn(db.sql, b, TX(6))).rejects.toThrow(/deposit_intents_burn_once|unique/);
  });

  it("refuses malformed addresses, hashes and amounts at the database", async () => {
    await expect(createDeposit(db.sql, { ...input, vault: "0x1" })).rejects.toThrow();
    await expect(createDeposit(db.sql, { ...input, amount: 0n })).rejects.toThrow();
    const id = await createDeposit(db.sql, input);
    await expect(recordBurn(db.sql, id, "0x12")).rejects.toThrow();
  });

  it("a failed deposit may still be rescued by its arrival record when the burn happened", async () => {
    const id = await createDeposit(db.sql, input);
    await recordBurn(db.sql, id, TX(7));
    expect(await failDeposit(db.sql, id, "timeout")).toBe(true);
    expect(await recordArrival(db.sql, id, { forwardTx: TX(8), received: 1n })).toBe(true);
    expect((await getDeposit(db.sql, id))?.status).toBe("arrived");
  });

  it("returns null for an unknown id and never throws on a malformed one", async () => {
    expect(await getDeposit(db.sql, "00000000-0000-0000-0000-000000000000")).toBeNull();
    expect(await getDeposit(db.sql, "not-a-uuid")).toBeNull();
  });
});
