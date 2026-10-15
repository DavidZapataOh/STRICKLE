// workflows/agent/tests/clock.test.ts
import { plainDate } from "@strickle/core";
import { describe, expect, it } from "vitest";
import { todayOf, windowSeed } from "../enclave/clock.ts";

describe("windowSeed", () => {
  const HOUR = 3_600_000;

  it("moves by the stride each period and not within one", () => {
    expect(windowSeed(5 * HOUR + 10, HOUR, 10)).toBe(50);
    expect(windowSeed(5 * HOUR + HOUR - 1, HOUR, 10)).toBe(50);
    expect(windowSeed(6 * HOUR, HOUR, 10)).toBe(60);
  });

  it("serves every vault of a registry of any size within ceil(count / stride) runs", () => {
    for (let count = 1; count <= 80; count++) {
      const covered = new Set<number>();
      for (let run = 0; run < Math.ceil(count / 10); run++) {
        const start = windowSeed((7 + run) * HOUR, HOUR, 10) % count;
        for (let i = 0; i < Math.min(10, count); i++) covered.add((start + i) % count);
      }
      expect(covered.size).toBe(count);
    }
  });
});

describe("todayOf", () => {
  const noon = new Date("2026-10-15T12:00:00Z");

  it("is the UTC calendar day", () => {
    expect(todayOf(noon, 0)).toEqual(plainDate(2026, 10, 15));
    expect(todayOf(new Date("2026-10-15T23:59:59Z"), 0)).toEqual(plainDate(2026, 10, 15));
    expect(todayOf(new Date("2026-10-16T00:00:00Z"), 0)).toEqual(plainDate(2026, 10, 16));
  });

  it("moves by the sandbox offset across month and year ends", () => {
    expect(todayOf(noon, 17)).toEqual(plainDate(2026, 11, 1));
    expect(todayOf(new Date("2026-12-20T00:00:00Z"), 12)).toEqual(plainDate(2027, 1, 1));
    expect(todayOf(noon, -15)).toEqual(plainDate(2026, 9, 30));
  });
});
