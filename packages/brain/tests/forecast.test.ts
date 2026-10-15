import fc from "fast-check";
import { addDays, parsePlainDate } from "@strickle/core";
import { describe, expect, it } from "vitest";
import { type CashEntry, type Forecast, breachShareBps, decompose, forecast, percentile } from "../src/forecast.ts";
import { mulberry32, randomBelow } from "../src/prng.ts";

const U = 1_000_000n;
const asOf = parsePlainDate("2026-10-15");
const ago = (days: number) => addDays(asOf, -days);
const entry = (daysAgo: number, amount: bigint, source: string): CashEntry => ({ date: ago(daysAgo), amount, source });

describe("decompose", () => {
  it("recognises a monthly retainer as a recurring flow", () => {
    const { recurring, variableWeeks } = decompose(
      [entry(60, 3_000n * U, "acme"), entry(30, 3_100n * U, "acme"), entry(0, 2_900n * U, "acme")],
      asOf,
    );
    expect(recurring).toEqual([{ source: "acme", amount: 3_000n * U, everyDays: 30, next: addDays(asOf, 30) }]);
    expect(variableWeeks.every((week) => week === 0n)).toBe(true);
  });

  it("recognises weekly rent as a recurring outflow", () => {
    const { recurring } = decompose([entry(21, -500n * U, "rent"), entry(14, -500n * U, "rent"), entry(7, -500n * U, "rent"), entry(0, -500n * U, "rent")], asOf);
    expect(recurring).toEqual([{ source: "rent", amount: -500n * U, everyDays: 7, next: addDays(asOf, 7) }]);
  });

  it("rolls the next occurrence forward when the last one is late", () => {
    const { recurring } = decompose([entry(24, -100n * U, "gym"), entry(17, -100n * U, "gym"), entry(10, -100n * U, "gym")], asOf);
    expect(recurring[0]?.next).toEqual(addDays(asOf, 4));
  });

  it("treats a source with irregular gaps as a project flow", () => {
    const { recurring, variableWeeks } = decompose([entry(70, 800n * U, "beta"), entry(20, 1_200n * U, "beta"), entry(0, 500n * U, "beta")], asOf);
    expect(recurring).toEqual([]);
    expect(variableWeeks[0]).toBe(500n * U);
    expect(variableWeeks[2]).toBe(1_200n * U);
    expect(variableWeeks[10]).toBe(800n * U);
  });

  it("accepts the 25 % tolerance edge and rejects one day beyond it", () => {
    const edge = decompose([entry(70, 1n, "s"), entry(30, 1n, "s"), entry(0, 1n, "s")], asOf);
    expect(edge.recurring).toHaveLength(1);
    const outside = decompose([entry(69, 1n, "s"), entry(29, 1n, "s"), entry(0, 1n, "s")], asOf);
    expect(outside.recurring).toEqual([]);
  });

  it("falls back to a project flow when the last entry is older than twice the cadence", () => {
    const { recurring, variableWeeks } = decompose([entry(34, -50n * U, "gym"), entry(27, -50n * U, "gym"), entry(20, -50n * U, "gym")], asOf);
    expect(recurring).toEqual([]);
    expect(variableWeeks.reduce((a, b) => a + b, 0n)).toBe(-150n * U);
  });

  it("needs three entries of the same sign", () => {
    const { recurring } = decompose([entry(60, 100n, "x"), entry(30, -100n, "x"), entry(0, 100n, "x")], asOf);
    expect(recurring).toEqual([]);
  });

  it("drops a one-off inflow and reports it, but keeps a one-off outflow", () => {
    const { variableWeeks, excludedOneOffIncome } = decompose([entry(3, 900n * U, "windfall"), entry(3, -400n * U, "laptop")], asOf);
    expect(excludedOneOffIncome).toBe(900n * U);
    expect(variableWeeks[0]).toBe(-400n * U);
  });

  it("ignores entries outside the 91-day window and in the future", () => {
    const { variableWeeks } = decompose(
      [entry(91, -1n, "old"), entry(90, -2n, "edge"), entry(-1, -4n, "future"), entry(0, -8n, "today")],
      asOf,
    );
    expect(variableWeeks).toHaveLength(13);
    expect(variableWeeks[12]).toBe(-2n);
    expect(variableWeeks[0]).toBe(-8n);
    expect(variableWeeks.reduce((a, b) => a + b, 0n)).toBe(-10n);
  });

  it("buckets days 0-6 into week 0 and days 7-13 into week 1", () => {
    const { variableWeeks } = decompose([entry(6, -1n, "a"), entry(7, -10n, "b"), entry(13, -100n, "c"), entry(14, -1000n, "d")], asOf);
    expect(variableWeeks.slice(0, 3)).toEqual([-1n, -110n, -1000n]);
  });

  it("does not depend on the order of the history", () => {
    const entries = fc.array(
      fc.record({
        daysAgo: fc.integer({ min: -3, max: 95 }),
        amount: fc.bigInt({ min: -5_000n * U, max: 5_000n * U }),
        source: fc.constantFrom("a", "b", "c", "d"),
      }),
      { maxLength: 40 },
    );
    fc.assert(
      fc.property(entries, fc.integer(), (raw, salt) => {
        const history = raw.map((e) => entry(e.daysAgo, e.amount, e.source));
        const cut = history.length === 0 ? 0 : Math.abs(salt) % history.length;
        const shuffled = [...history.slice(cut), ...history.slice(0, cut)].reverse();
        expect(decompose(shuffled, asOf)).toEqual(decompose(history, asOf));
      }),
      { numRuns: 200 },
    );
  });
});

const noisy: CashEntry[] = [
  entry(80, 1_200n * U, "p"),
  entry(66, 400n * U, "p"),
  entry(52, 2_500n * U, "p"),
  entry(33, 150n * U, "p"),
  entry(20, 1_800n * U, "p"),
  entry(9, 700n * U, "p"),
  entry(75, -300n * U, "tools"),
  entry(60, -900n * U, "tools"),
  entry(12, -250n * U, "tools"),
];
const base = { asset: "USDC", asOf, openingBalance: 5_000n * U, history: noisy, seed: 11 } as const;

describe("forecast", () => {
  it("is deterministic for a seed and varies with it", () => {
    expect(forecast(base)).toEqual(forecast(base));
    expect(forecast({ ...base, seed: 12 }).paths).not.toEqual(forecast(base).paths);
  });

  it("defaults to 200 scenarios over 13 weeks", () => {
    const f = forecast(base);
    expect(f.scenarios).toBe(200);
    expect(f.weeks).toBe(13);
    expect(f.paths).toHaveLength(200);
    expect(f.paths.every((row) => row.length === 13)).toBe(true);
    expect(f.p50).toHaveLength(13);
    expect(f.p10).toHaveLength(13);
  });

  it("honours custom scenario and week counts", () => {
    const f = forecast({ ...base, scenarios: 5, weeks: 4 });
    expect(f.paths).toHaveLength(5);
    expect(f.paths[0]).toHaveLength(4);
  });

  it("stays flat at the opening balance without any history", () => {
    const f = forecast({ ...base, history: [] });
    expect(f.p50).toEqual(Array.from({ length: 13 }, () => 5_000n * U));
    expect(f.p10).toEqual(f.p50);
  });

  it("follows recurring flows exactly with no spread", () => {
    const rent = [entry(21, -500n * U, "rent"), entry(14, -500n * U, "rent"), entry(7, -500n * U, "rent"), entry(0, -500n * U, "rent")];
    const f = forecast({ ...base, history: rent });
    const expected = Array.from({ length: 13 }, (_, week) => 5_000n * U - 500n * U * BigInt(week + 1));
    expect(f.p50).toEqual(expected);
    expect(f.p10).toEqual(expected);
    expect(new Set(f.paths.map((row) => row.join())).size).toBe(1);
  });

  it("places a monthly inflow in the right forecast week", () => {
    const retainer = [entry(60, 3_000n * U, "acme"), entry(30, 3_000n * U, "acme"), entry(0, 3_000n * U, "acme")];
    const f = forecast({ ...base, history: retainer, weeks: 13 });
    expect(f.p50[3]).toBe(5_000n * U);
    expect(f.p50[4]).toBe(8_000n * U);
    expect(f.p50[8]).toBe(11_000n * U);
    expect(f.p50[12]).toBe(14_000n * U);
  });

  it("ignores one-off income but not a one-off outflow", () => {
    const withWindfall = forecast({ ...base, history: [entry(5, 9_000n * U, "windfall")] });
    expect(withWindfall).toEqual(forecast({ ...base, history: [] }));
    const withBill = forecast({ ...base, history: [entry(5, -9_000n * U, "bill")] });
    expect(withBill.p10[12]).toBeLessThan(5_000n * U);
  });

  it("keeps p10 at or below p50 in every week", () => {
    const f = forecast(base);
    f.p10.forEach((value, week) => expect(value).toBeLessThanOrEqual(f.p50[week] as bigint));
  });

  it("reports the 20th and 100th smallest of the 200 balances of each week", () => {
    const f = forecast(base);
    for (let week = 0; week < f.weeks; week++) {
      const column = f.paths.map((path) => path[week] as bigint).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
      expect(f.p10[week]).toBe(column[19]);
      expect(f.p50[week]).toBe(column[99]);
    }
  });

  it("rejects invalid parameters", () => {
    expect(() => forecast({ ...base, scenarios: 0 })).toThrow(RangeError);
    expect(() => forecast({ ...base, scenarios: 2.5 })).toThrow(RangeError);
    expect(() => forecast({ ...base, weeks: 0 })).toThrow(RangeError);
    expect(() => forecast({ ...base, seed: -1 })).toThrow(RangeError);
  });

  it("matches an independent replay of the draws for any seed", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 0xffff_ffff }), (seed) => {
        const f = forecast({ ...base, seed, scenarios: 20 });
        const { variableWeeks } = decompose(noisy, asOf);
        const next = mulberry32(seed);
        for (const row of f.paths) {
          let balance = base.openingBalance;
          row.forEach((closing) => {
            balance += variableWeeks[randomBelow(next, 13)] as bigint;
            expect(closing).toBe(balance);
          });
        }
        f.p10.forEach((value, week) => expect(value).toBeLessThanOrEqual(f.p50[week] as bigint));
      }),
      { numRuns: 200 },
    );
  });

  it("does not depend on the order of the history", () => {
    const reversed = [...noisy].reverse();
    expect(forecast({ ...base, history: reversed })).toEqual(forecast(base));
  });
});

describe("percentile", () => {
  const sorted = Array.from({ length: 200 }, (_, i) => BigInt(i + 1));

  it("uses nearest rank", () => {
    expect(percentile(sorted, 1_000)).toBe(20n);
    expect(percentile(sorted, 5_000)).toBe(100n);
    expect(percentile(sorted, 10_000)).toBe(200n);
    expect(percentile(sorted, 0)).toBe(1n);
    expect(percentile([7n], 1_000)).toBe(7n);
    expect(percentile([1n, 2n, 3n, 4n, 5n, 6n, 7n], 5_000)).toBe(4n);
    expect(percentile([1n, 2n, 3n, 4n, 5n, 6n, 7n], 3_000)).toBe(3n);
  });
});

describe("breachShareBps", () => {
  const f: Forecast = {
    asset: "USDC",
    weeks: 3,
    scenarios: 3,
    openingBalance: 100n,
    p50: [],
    p10: [],
    paths: [
      [120n, 130n, 140n],
      [90n, 130n, 140n],
      [120n, 130n, 50n],
    ],
  };

  it("counts scenarios whose minimum is below the threshold, rounding up", () => {
    expect(breachShareBps(f, 100n, 3)).toBe(6_667);
    expect(breachShareBps(f, 100n, 2)).toBe(3_334);
    expect(breachShareBps(f, 50n, 3)).toBe(0);
  });

  it("includes the opening balance", () => {
    expect(breachShareBps(f, 101n, 1)).toBe(10_000);
  });

  it("treats a balance equal to the threshold as safe", () => {
    expect(breachShareBps(f, 90n, 2)).toBe(0);
  });
});
