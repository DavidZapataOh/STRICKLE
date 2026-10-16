import { describe, expect, it } from "vitest";
import { depositRoom, exposureReport } from "../src/server/limits.ts";

const limits = { perUserUnits: 250_000_000n, totalUnits: 2_000_000_000n };
const a = "0x00000000000000000000000000000000000000a1" as const;
const b = "0x00000000000000000000000000000000000000b2" as const;

describe("depositRoom", () => {
  it("allows a deposit that lands exactly on a ceiling and refuses one unit more", () => {
    expect(depositRoom({ held: 200_000_000n, totalHeld: 0n, limits, incoming: 50_000_000n }).allowed).toBe(true);
    expect(depositRoom({ held: 200_000_000n, totalHeld: 0n, limits, incoming: 50_000_001n }).allowed).toBe(false);
    expect(depositRoom({ held: 0n, totalHeld: 1_950_000_000n, limits, incoming: 50_000_000n }).allowed).toBe(true);
    expect(depositRoom({ held: 0n, totalHeld: 1_950_000_000n, limits, incoming: 50_000_001n }).allowed).toBe(false);
  });

  it("reports the room that is left and never a negative one", () => {
    expect(depositRoom({ held: 300_000_000n, totalHeld: 300_000_000n, limits })).toEqual({ allowed: true, perUserRoom: 0n, totalRoom: 1_700_000_000n });
  });

  it("refuses a negative deposit", () => {
    expect(() => depositRoom({ held: 0n, totalHeld: 0n, limits, incoming: -1n })).toThrow();
  });
});

describe("exposureReport", () => {
  it("flags every vault above its ceiling, with the excess, and the total", () => {
    const report = exposureReport([{ address: a, owner: a, held: 300_000_000n }, { address: b, owner: b, held: 100_000_000n }], limits);
    expect(report.totalHeld).toBe(400_000_000n);
    expect(report.overTotal).toBe(false);
    expect(report.overPerUser).toEqual([{ address: a, owner: a, held: 300_000_000n, excess: 50_000_000n }]);
  });

  it("flags the total ceiling", () => {
    const many = Array.from({ length: 9 }, (_, i) => ({ address: a, owner: a, held: 250_000_000n + BigInt(i) }));
    expect(exposureReport(many, limits).overTotal).toBe(true);
  });
});
