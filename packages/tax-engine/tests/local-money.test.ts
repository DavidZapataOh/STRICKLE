import { describe, expect, it } from "vitest";
import { applyRateBps, formatLocal, parseLocal } from "../src/local-money.ts";

describe("parseLocal", () => {
  it.each([
    ["12009410.45", 1200941045n],
    ["25000", 2500000n],
    ["0.5", 50n],
    ["0", 0n],
    ["3500000.00", 350000000n],
  ])("reads %s", (text, minor) => {
    expect(parseLocal(text)).toBe(minor);
  });

  it.each(["1.234", "-1", "", " ", "1,000", "abc", "1.", ".5", "1e3"])("rejects %j", (text) => {
    expect(() => parseLocal(text)).toThrow(RangeError);
  });
});

describe("formatLocal", () => {
  it("prints two decimals", () => {
    expect(formatLocal(1200941045n)).toBe("12009410.45");
    expect(formatLocal(5n)).toBe("0.05");
    expect(formatLocal(0n)).toBe("0.00");
  });
});

describe("applyRateBps", () => {
  it("rounds half to even at the minor unit", () => {
    expect(applyRateBps(2500001n, 110)).toBe(27500n);
    expect(applyRateBps(10_000_000n, 200)).toBe(200_000n);
    expect(applyRateBps(50n, 100)).toBe(0n);
    expect(applyRateBps(150n, 100)).toBe(2n);
    expect(applyRateBps(250n, 100)).toBe(2n);
  });
});
