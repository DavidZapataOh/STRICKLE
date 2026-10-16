import { describe, expect, it } from "vitest";
import { ttlCache } from "../src/app/api/logs/cache.ts";
import { rateLimit } from "../src/app/api/logs/limit.ts";

describe("ttlCache", () => {
  it("returns a value until its time is up", () => {
    let now = 1_000;
    const cache = ttlCache<string>(20_000, () => now);
    cache.set("a", "x");
    expect(cache.get("a")).toBe("x");
    now += 19_999;
    expect(cache.get("a")).toBe("x");
    now += 2;
    expect(cache.get("a")).toBeUndefined();
  });

  it("keeps at most 500 entries, dropping the oldest", () => {
    const cache = ttlCache<number>(60_000, () => 0);
    for (let i = 0; i < 501; i++) cache.set(String(i), i);
    expect(cache.get("0")).toBeUndefined();
    expect(cache.get("500")).toBe(500);
  });
});

describe("rateLimit", () => {
  it("lets a caller through up to the limit and tells it when to come back", () => {
    let now = 0;
    const allow = rateLimit(3, 60_000, () => now);
    expect([1, 2, 3].map(() => allow("a").allowed)).toEqual([true, true, true]);
    expect(allow("a")).toEqual({ allowed: false, retryAfterSeconds: 60 });
    expect(allow("b").allowed).toBe(true);
    now = 60_000;
    expect(allow("a").allowed).toBe(true);
  });
});
