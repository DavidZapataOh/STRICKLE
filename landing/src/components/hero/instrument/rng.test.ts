import { describe, expect, it } from "vitest";
import { createRng, nextSeed } from "./rng";

describe("createRng", () => {
  it("is deterministic for the same seed", () => {
    const a = createRng(42);
    const b = createRng(42);
    const seqA = Array.from({ length: 10 }, () => a());
    const seqB = Array.from({ length: 10 }, () => b());
    expect(seqA).toEqual(seqB);
  });

  it("differs across seeds", () => {
    const a = createRng(1)();
    const b = createRng(2)();
    expect(a).not.toBe(b);
  });

  it("stays within [0, 1)", () => {
    const r = createRng(7);
    for (let i = 0; i < 1000; i++) {
      const v = r();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe("nextSeed", () => {
  it("is deterministic and changes the seed", () => {
    expect(nextSeed(5)).toBe(nextSeed(5));
    expect(nextSeed(5)).not.toBe(5);
    expect(Number.isInteger(nextSeed(5))).toBe(true);
    expect(nextSeed(5)).toBeGreaterThanOrEqual(0);
  });
});
