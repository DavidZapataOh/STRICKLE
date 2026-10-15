import { describe, expect, it } from "vitest";
import { applyWithholdings } from "../src/index.ts";

describe("applyWithholdings", () => {
  it("subtracts credits from the liability", () => {
    expect(applyWithholdings(200_000n, [50_000n, 25_000n])).toEqual({ due: 125_000n, credit: 0n });
  });
  it("is exact when credits equal the liability", () => {
    expect(applyWithholdings(125_000n, [125_000n])).toEqual({ due: 0n, credit: 0n });
  });
  it("carries the excess as a credit", () => {
    expect(applyWithholdings(20_000n, [100_000n])).toEqual({ due: 0n, credit: 80_000n });
  });
  it("works with no credits and with zero liability", () => {
    expect(applyWithholdings(7n, [])).toEqual({ due: 7n, credit: 0n });
    expect(applyWithholdings(0n, [5n])).toEqual({ due: 0n, credit: 5n });
  });
  it("rejects negative amounts", () => {
    expect(() => applyWithholdings(-1n, [])).toThrow(RangeError);
    expect(() => applyWithholdings(1n, [-1n])).toThrow(RangeError);
  });
});
