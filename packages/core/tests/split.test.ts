import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { money, sum } from "../src/money.ts";
import { mulDiv } from "../src/rounding.ts";
import { type Share, split } from "../src/split.ts";

const usdc = (units: bigint) => money("USDC", units);
const units = (allocations: ReturnType<typeof split>) => allocations.map((a) => a.amount.units);

const sharesArbitrary = fc
  .array(fc.integer({ min: 0, max: 10_000 }), { maxLength: 11 })
  .map((cuts): Share[] => {
    const points = [0, ...cuts.toSorted((a, b) => a - b), 10_000];
    return points.slice(1).map((point, i) => ({ key: `box${i}`, bps: point - (points[i] ?? 0) }));
  });

describe("split", () => {
  it("gives the leftover unit to the largest remainder", () => {
    const shares = [
      { key: "a", bps: 3333 },
      { key: "b", bps: 3333 },
      { key: "c", bps: 3334 },
    ];
    expect(units(split(usdc(10n), shares))).toEqual([3n, 3n, 4n]);
  });

  it("breaks ties in favour of the earlier share", () => {
    const shares = [
      { key: "a", bps: 5000 },
      { key: "b", bps: 5000 },
    ];
    expect(units(split(usdc(1n), shares))).toEqual([1n, 0n]);
  });

  it("splits zero into zeros and keeps keys and order", () => {
    const shares = [
      { key: "taxes", bps: 3000 },
      { key: "salary", bps: 7000 },
    ];
    expect(split(usdc(0n), shares)).toEqual([
      { key: "taxes", amount: usdc(0n) },
      { key: "salary", amount: usdc(0n) },
    ]);
  });

  it.each([
    ["negative total", usdc(-1n), [{ key: "a", bps: 10_000 }]],
    ["no shares", usdc(1n), []],
    ["bps below 10000", usdc(1n), [{ key: "a", bps: 9_999 }]],
    ["bps above 10000", usdc(1n), [{ key: "a", bps: 10_001 }]],
    ["fractional bps", usdc(1n), [{ key: "a", bps: 9_999.5 }, { key: "b", bps: 0.5 }]],
    ["negative bps", usdc(1n), [{ key: "a", bps: 12_000 }, { key: "b", bps: -2_000 }]],
  ] as const)("rejects %s", (_name, total, shares) => {
    expect(() => split(total, shares as unknown as Share[])).toThrow(RangeError);
  });

  it("never creates or loses a unit", () => {
    fc.assert(
      fc.property(fc.bigInt({ min: 0n, max: 10n ** 30n }), sharesArbitrary, (total, shares) => {
        const parts = split(usdc(total), shares);
        expect(sum("USDC", parts.map((p) => p.amount))).toEqual(usdc(total));
      }),
    );
  });

  it("keeps every part within one unit of its exact share and gives nothing to a 0 bps share", () => {
    fc.assert(
      fc.property(fc.bigInt({ min: 0n, max: 10n ** 30n }), sharesArbitrary, (total, shares) => {
        split(usdc(total), shares).forEach((part, i) => {
          const bps = BigInt(shares[i]?.bps ?? 0);
          const floor = mulDiv(total, bps, 10_000n, "floor");
          const ceil = mulDiv(total, bps, 10_000n, "ceil");
          expect(part.amount.units === floor || part.amount.units === ceil).toBe(true);
          if (bps === 0n) expect(part.amount.units).toBe(0n);
        });
      }),
    );
  });

  it("is deterministic and preserves order and keys", () => {
    fc.assert(
      fc.property(fc.bigInt({ min: 0n, max: 10n ** 18n }), sharesArbitrary, (total, shares) => {
        const first = split(usdc(total), shares);
        expect(split(usdc(total), shares)).toEqual(first);
        expect(first.map((p) => p.key)).toEqual(shares.map((s) => s.key));
      }),
    );
  });
});
