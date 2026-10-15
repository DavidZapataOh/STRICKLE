import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { add, money } from "../src/money.ts";
import { mulDiv, portion } from "../src/rounding.ts";

describe("mulDiv", () => {
  it.each([
    [10n, 1n, 4n, "floor", 2n],
    [10n, 1n, 4n, "ceil", 3n],
    [10n, 1n, 4n, "halfEven", 2n],
    [14n, 1n, 4n, "halfEven", 4n],
    [11n, 1n, 4n, "halfEven", 3n],
    [12n, 1n, 4n, "floor", 3n],
    [12n, 1n, 4n, "ceil", 3n],
    [0n, 5n, 3n, "ceil", 0n],
  ] as const)("mulDiv(%s, %s, %s, %s) = %s", (a, b, d, mode, expected) => {
    expect(mulDiv(a, b, d, mode)).toBe(expected);
  });

  it("rejects negative factors and a non-positive divisor", () => {
    expect(() => mulDiv(-1n, 1n, 1n, "floor")).toThrow(RangeError);
    expect(() => mulDiv(1n, -1n, 1n, "floor")).toThrow(RangeError);
    expect(() => mulDiv(1n, 1n, 0n, "floor")).toThrow(RangeError);
  });

  const operands = fc.record({
    a: fc.bigInt({ min: 0n, max: 10n ** 24n }),
    b: fc.bigInt({ min: 0n, max: 10n ** 12n }),
    d: fc.bigInt({ min: 1n, max: 10n ** 12n }),
  });

  it("floor and ceil bracket the exact quotient by at most one unit", () => {
    fc.assert(
      fc.property(operands, ({ a, b, d }) => {
        const floor = mulDiv(a, b, d, "floor");
        const ceil = mulDiv(a, b, d, "ceil");
        expect(floor * d).toBeLessThanOrEqual(a * b);
        expect(ceil * d).toBeGreaterThanOrEqual(a * b);
        expect(ceil - floor).toBeLessThanOrEqual(1n);
      }),
    );
  });

  it("halfEven is never more than half a unit from the exact quotient", () => {
    fc.assert(
      fc.property(operands, ({ a, b, d }) => {
        const result = mulDiv(a, b, d, "halfEven");
        const error = 2n * (result * d - a * b);
        expect(error < 0n ? -error : error).toBeLessThanOrEqual(d);
      }),
    );
  });
});

describe("portion", () => {
  it("returns the part and the rest, which always add back to the total", () => {
    fc.assert(
      fc.property(
        fc.bigInt({ min: 0n, max: 10n ** 24n }),
        fc.bigInt({ min: 1n, max: 10_000n }),
        fc.constantFrom("floor", "ceil", "halfEven"),
        (units, denominator, mode) => {
          const numerator = denominator / 3n;
          const total = money("USDC", units);
          const { part, rest } = portion(total, numerator, denominator, mode);
          expect(add(part, rest)).toEqual(total);
          expect(rest.units).toBeGreaterThanOrEqual(0n);
        },
      ),
    );
  });

  it("rejects a portion larger than the whole", () => {
    expect(() => portion(money("USDC", 10n), 3n, 2n, "floor")).toThrow(RangeError);
  });
});
