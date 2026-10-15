import { describe, expect, it } from "vitest";
import { AssetMismatchError, add, compare, money, sub, sum } from "../src/money.ts";

describe("money", () => {
  it("adds and subtracts in the same asset", () => {
    expect(add(money("USDC", 5n), money("USDC", 7n))).toEqual(money("USDC", 12n));
    expect(sub(money("USDC", 5n), money("USDC", 7n))).toEqual(money("USDC", -2n));
  });

  it("refuses to combine different assets", () => {
    expect(() => add(money("USDC", 1n), money("EURC", 1n))).toThrow(AssetMismatchError);
    expect(() => sub(money("USDC", 1n), money("EURC", 1n))).toThrow(AssetMismatchError);
    expect(() => compare(money("USDC", 1n), money("EURC", 1n))).toThrow(AssetMismatchError);
  });

  it("compares", () => {
    expect(compare(money("USDC", 1n), money("USDC", 2n))).toBe(-1);
    expect(compare(money("USDC", 2n), money("USDC", 2n))).toBe(0);
    expect(compare(money("USDC", 3n), money("USDC", 2n))).toBe(1);
  });

  it("sums a list, and an empty list is zero of the asset", () => {
    expect(sum("EURC", [money("EURC", 1n), money("EURC", 2n), money("EURC", 3n)])).toEqual(money("EURC", 6n));
    expect(sum("EURC", [])).toEqual(money("EURC", 0n));
  });

  it("keeps amounts beyond 2^53 exact", () => {
    const big = 2n ** 80n;
    expect(sub(add(money("USDC", big), money("USDC", 1n)), money("USDC", big))).toEqual(money("USDC", 1n));
  });
});
