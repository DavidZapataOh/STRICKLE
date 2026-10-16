import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createLimiter } from "../../src/limiter.ts";
import { migrate } from "../../src/migrate.ts";
import { createTestDatabase } from "./helpers.ts";

let db: Awaited<ReturnType<typeof createTestDatabase>>;
let limiter: ReturnType<typeof createLimiter>;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

beforeAll(async () => {
  db = await createTestDatabase();
  await migrate(db.sql);
  limiter = createLimiter(db.sql);
});
afterAll(async () => db.drop());

describe("count", () => {
  it("allows up to the limit inside a window and then refuses with a wait", async () => {
    const results = [];
    for (let i = 0; i < 4; i++) results.push(await limiter.count("ip:a", 60, 3));
    expect(results.map((r) => r.allowed)).toEqual([true, true, true, false]);
    expect(results[3]?.retryAfterSeconds).toBeGreaterThan(0);
    expect(results[3]?.retryAfterSeconds).toBeLessThanOrEqual(60);
  });

  it("keeps keys apart and starts a new window after the old one ends", async () => {
    expect((await limiter.count("ip:b", 1, 1)).allowed).toBe(true);
    expect((await limiter.count("ip:b", 1, 1)).allowed).toBe(false);
    expect((await limiter.count("ip:c", 1, 1)).allowed).toBe(true);
    await sleep(1_100);
    expect((await limiter.count("ip:b", 1, 1)).allowed).toBe(true);
  });

  it("never lets two concurrent callers both take the last place", async () => {
    const results = await Promise.all(Array.from({ length: 20 }, () => limiter.count("ip:race", 60, 5)));
    expect(results.filter((r) => r.allowed)).toHaveLength(5);
  });
});

describe("claimSlot", () => {
  it("lets exactly one of many concurrent callers claim a slot", async () => {
    const results = await Promise.all(Array.from({ length: 20 }, () => limiter.claimSlot("gateway:test", 30)));
    expect(results.filter((r) => r.claimed)).toHaveLength(1);
    const refused = results.find((r) => !r.claimed);
    expect(refused && !refused.claimed && refused.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("frees the slot after its interval", async () => {
    expect((await limiter.claimSlot("slot:short", 1)).claimed).toBe(true);
    expect((await limiter.claimSlot("slot:short", 1)).claimed).toBe(false);
    await sleep(1_100);
    expect((await limiter.claimSlot("slot:short", 1)).claimed).toBe(true);
  });

  it("frees the slot when its holder releases it, and only for the holder's token", async () => {
    const first = await limiter.claimSlot("slot:release", 30);
    if (!first.claimed) throw new Error("expected to claim");
    await limiter.releaseSlot("slot:release", "a token that is not the holder's");
    expect((await limiter.claimSlot("slot:release", 30)).claimed).toBe(false);
    await limiter.releaseSlot("slot:release", first.token);
    expect((await limiter.claimSlot("slot:release", 30)).claimed).toBe(true);
  });
});
