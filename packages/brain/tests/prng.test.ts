import { describe, expect, it } from "vitest";
import { mulberry32, randomBelow } from "../src/prng.ts";

describe("mulberry32", () => {
  it("repeats the same sequence for the same seed", () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    const first = Array.from({ length: 5 }, () => a());
    expect(Array.from({ length: 5 }, () => b())).toEqual(first);
  });

  it("differs between seeds", () => {
    expect(mulberry32(1)()).not.toBe(mulberry32(2)());
  });

  it("matches the reference first draw for seed 1", () => {
    expect(mulberry32(1)()).toBe(0.6270739405881613);
  });

  it("stays within [0, 1)", () => {
    const next = mulberry32(7);
    for (let i = 0; i < 10_000; i++) {
      const value = next();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it("rejects a seed that is not a uint32", () => {
    for (const seed of [-1, 1.5, 2 ** 32, Number.NaN]) expect(() => mulberry32(seed)).toThrow(RangeError);
  });
});

describe("randomBelow", () => {
  it("covers every value of a small bound and never leaves it", () => {
    const next = mulberry32(3);
    const seen = new Set<number>();
    for (let i = 0; i < 1_000; i++) {
      const value = randomBelow(next, 13);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(13);
      seen.add(value);
    }
    expect(seen.size).toBe(13);
  });

  it("rejects a bound that is not a positive integer", () => {
    for (const bound of [0, -3, 1.5]) expect(() => randomBelow(mulberry32(1), bound)).toThrow(RangeError);
  });
});
