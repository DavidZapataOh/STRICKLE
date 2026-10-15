import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { formatDecimal, fromNative, parseDecimal, toNative } from "../src/decimal.ts";
import { money } from "../src/money.ts";

describe("parseDecimal and formatDecimal", () => {
  it.each([
    ["0", 0n],
    ["1", 1_000_000n],
    ["1.5", 1_500_000n],
    ["0.000001", 1n],
    ["12.345678", 12_345_678n],
    ["007.50", 7_500_000n],
  ])("parses %s", (text, units) => {
    expect(parseDecimal("USDC", text)).toEqual(money("USDC", units));
  });

  it.each([
    [0n, "0"],
    [1n, "0.000001"],
    [1_500_000n, "1.5"],
    [12_345_678n, "12.345678"],
    [-500_000n, "-0.5"],
  ])("formats %s units as %s", (units, text) => {
    expect(formatDecimal(money("EURC", units))).toBe(text);
  });

  it.each(["", " 1", "1 ", "-1", "+1", ".5", "1.", "1e3", "1,5", "1.0000001", "0x10", "١٢٣", "1.2.3"])(
    "rejects %j without rounding it",
    (text) => {
      expect(() => parseDecimal("USDC", text)).toThrow(RangeError);
    },
  );

  it("round-trips any non-negative amount", () => {
    fc.assert(
      fc.property(fc.bigInt({ min: 0n, max: 10n ** 30n }), (units) => {
        const m = money("USDC", units);
        expect(parseDecimal("USDC", formatDecimal(m))).toEqual(m);
      }),
    );
  });
});

describe("native 18-decimal conversion", () => {
  it("converts whole units exactly", () => {
    expect(fromNative(10n ** 18n)).toEqual({ money: money("USDC", 1_000_000n), dust: 0n });
    expect(toNative(money("USDC", 1_000_000n))).toBe(10n ** 18n);
  });

  it("returns the sub-unit remainder instead of dropping it", () => {
    expect(fromNative(1_999_999_999_999n)).toEqual({ money: money("USDC", 1n), dust: 999_999_999_999n });
  });

  it("never loses or creates native units", () => {
    fc.assert(
      fc.property(fc.bigInt({ min: 0n, max: 10n ** 40n }), (native) => {
        const { money: m, dust } = fromNative(native);
        expect(toNative(m) + dust).toBe(native);
        expect(dust).toBeGreaterThanOrEqual(0n);
        expect(dust).toBeLessThan(10n ** 12n);
      }),
    );
  });

  it("rejects negative native balances and EURC", () => {
    expect(() => fromNative(-1n)).toThrow(RangeError);
    expect(() => toNative(money("EURC", 1n))).toThrow(TypeError);
  });
});
