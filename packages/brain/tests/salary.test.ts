import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { Forecast } from "../src/forecast.ts";
import { type SalaryInput, decideSalary } from "../src/salary.ts";

/** A forecast whose scenario s dips to `minimums[s]` in week 0 and then returns to the opening balance. */
function forecastWith(opening: bigint, minimums: bigint[], weeks = 13): Forecast {
  const paths = minimums.map((min) => Array.from({ length: weeks }, (_, week) => (week === 0 ? min : opening)));
  return { asset: "USDC", weeks, scenarios: minimums.length, openingBalance: opening, p50: [], p10: [], paths };
}

const spend = 10n; // floor = 14 x 10 = 140
const base = (over: Partial<SalaryInput> = {}): SalaryInput => ({
  proposed: 700n, pending: 0n, salaryBoxBalance: 5_000n, bufferBalance: 1_000n,
  taxesFunded: 400n, taxesDue: 400n, dailySpend: spend, historyWeeks: 13,
  forecast: forecastWith(1_000n, Array.from({ length: 200 }, () => 900n)), ...over,
});

describe("decideSalary: the three P8 conditions", () => {
  it("pays in full when everything holds", () => {
    const d = decideSalary(base());
    expect(d).toMatchObject({ owed: 700n, payNow: 700n, pending: 0n, binding: "full" });
    expect(d.ceilings).toEqual({ box: 5_000n, cushion: 860n, scenarios: 760n });
    expect(d.breachBps).toBe(0);
  });

  it("trims to the scenario ceiling and carries the rest", () => {
    const d = decideSalary(base({ proposed: 800n }));
    expect(d).toMatchObject({ payNow: 760n, pending: 40n, safeMax: 760n, binding: "scenario-risk" });
  });

  it("uses the (allowed + 1)-th smallest slack: 4 breaches of 200 are allowed at 2%", () => {
    const minimums = [...Array(4).fill(100n), 400n, ...Array(195).fill(900n)];
    const d = decideSalary(base({ proposed: 5_000n, forecast: forecastWith(1_000n, minimums) }));
    expect(d.ceilings.scenarios).toBe(260n);
    expect(d.payNow).toBe(260n);
    expect(d.breachBps).toBe(200); // 4 of 200
    const over = decideSalary(base({ proposed: 261n, forecast: forecastWith(1_000n, minimums) }));
    expect(over.payNow).toBe(260n); // 261 would breach 5 of 200 = 250 bps
  });

  it("binds on the cushion when no scenario dips below the opening balance", () => {
    const d = decideSalary(base({ proposed: 900n, forecast: forecastWith(1_000n, Array.from({ length: 200 }, () => 1_000n)) }));
    expect(d).toMatchObject({ payNow: 860n, pending: 40n, binding: "cushion-floor" });
  });

  it("binds on what the salary box holds", () => {
    const d = decideSalary(base({ proposed: 800n, salaryBoxBalance: 500n }));
    expect(d).toMatchObject({ payNow: 500n, pending: 300n, binding: "salary-box" });
  });

  it("pays nothing when the taxes are not covered, and pays when funded equals due", () => {
    expect(decideSalary(base({ taxesFunded: 399n }))).toMatchObject({ payNow: 0n, pending: 700n, binding: "taxes-not-covered", safeMax: 0n });
    expect(decideSalary(base({ taxesFunded: 400n })).payNow).toBe(700n);
  });

  it("never pays a negative amount when the buffer is already under the floor", () => {
    const d = decideSalary(base({ bufferBalance: 100n, forecast: forecastWith(100n, Array.from({ length: 200 }, () => 100n)) }));
    expect(d.payNow).toBe(0n);
    expect(d.safeMax).toBe(0n);
    expect(d.pending).toBe(700n);
  });
});

describe("decideSalary: unknowns close the gates", () => {
  it("pays 0 when the daily spend is unknown (zero)", () => {
    expect(decideSalary(base({ dailySpend: 0n }))).toMatchObject({ payNow: 0n, binding: "spend-unknown" });
  });
  it("pays 0 with fewer than the minimum weeks of history, and pays with exactly the minimum", () => {
    expect(decideSalary(base({ historyWeeks: 3 }))).toMatchObject({ payNow: 0n, binding: "insufficient-history" });
    expect(decideSalary(base({ historyWeeks: 4 })).payNow).toBe(700n);
  });
  it("carries pending salary first: owed is proposed plus pending", () => {
    const d = decideSalary(base({ proposed: 500n, pending: 300n }));
    expect(d).toMatchObject({ owed: 800n, payNow: 760n, pending: 40n });
  });
});

describe("decideSalary: options and validation", () => {
  it("counts only the first horizonWeeks of each path", () => {
    const paths = [[900n, 1_000n, 1_000n, 100n]]; // dips late, week 3
    const f: Forecast = { asset: "USDC", weeks: 4, scenarios: 1, openingBalance: 1_000n, p50: [], p10: [], paths };
    const short = decideSalary(base({ proposed: 5_000n, forecast: f, policy: { horizonWeeks: 3 } }));
    const long = decideSalary(base({ proposed: 5_000n, forecast: f, policy: { horizonWeeks: 4 } }));
    expect(short.ceilings.scenarios).toBe(760n);
    expect(long.ceilings.scenarios).toBe(0n - 40n);
  });
  it("epsilon 0 lets no scenario breach: the ceiling is the smallest slack (300 - 140)", () => {
    const f = forecastWith(1_000n, [300n, ...Array(99).fill(900n)]);
    expect(decideSalary(base({ proposed: 5_000n, forecast: f, policy: { epsilonBps: 0 } })).ceilings.scenarios).toBe(160n);
  });
  it("with n = 100 and epsilon 2% two scenarios may breach: the third smallest slack counts, and a bigger floor lowers it", () => {
    const f = forecastWith(1_000n, [...Array(3).fill(300n), ...Array(97).fill(900n)]);
    expect(decideSalary(base({ proposed: 5_000n, forecast: f })).ceilings.scenarios).toBe(160n); // 300 - 14 x 10
    expect(decideSalary(base({ proposed: 5_000n, forecast: f, policy: { floorDays: 20 } })).ceilings.scenarios).toBe(100n); // 300 - 20 x 10
  });
  it("a custom history minimum is honoured", () => {
    expect(decideSalary(base({ historyWeeks: 2, policy: { minHistoryWeeks: 2 } })).payNow).toBe(700n);
  });
  it("counts the opening balance in every scenario's minimum: paths that only rise keep the ceiling at opening minus floor", () => {
    const rising: Forecast = { asset: "USDC", weeks: 3, scenarios: 2, openingBalance: 1_000n, p50: [], p10: [], paths: [[1_100n, 1_200n, 1_300n], [1_050n, 1_100n, 1_200n]] };
    expect(decideSalary(base({ proposed: 5_000n, forecast: rising })).ceilings.scenarios).toBe(860n);
  });
  it("rejects negative amounts, a bad policy, a forecast that disagrees with the buffer and an empty forecast", () => {
    expect(() => decideSalary(base({ proposed: -1n }))).toThrow(RangeError);
    expect(() => decideSalary(base({ pending: -1n }))).toThrow(RangeError);
    expect(() => decideSalary(base({ policy: { floorDays: 0 } }))).toThrow(RangeError);
    expect(() => decideSalary(base({ policy: { epsilonBps: 10_000 } }))).toThrow(RangeError);
    expect(() => decideSalary(base({ policy: { epsilonBps: -1 } }))).toThrow(RangeError);
    expect(() => decideSalary(base({ bufferBalance: 999n }))).toThrow(/opening balance/);
    expect(() => decideSalary(base({ forecast: forecastWith(1_000n, []) }))).toThrow(RangeError);
  });
});

/** Independent brute force: how many scenarios drop below the floor if `amount` is paid. */
function breachBps(f: Forecast, floor: bigint, amount: bigint, weeks: number): number {
  let breaches = 0;
  for (const path of f.paths) {
    const lowest = path.slice(0, weeks).reduce((m, v) => (v < m ? v : m), f.openingBalance);
    if (lowest - amount < floor) breaches++;
  }
  return Math.ceil((breaches * 10_000) / f.scenarios);
}

describe("decideSalary: properties", () => {
  const scenarioSets = fc.array(fc.bigInt({ min: 0n, max: 1_000n }), { minLength: 1, maxLength: 210 }); // covers n = 199 and 200
  const epsilons = fc.constantFrom(0, 100, 200, 500, 2_000);

  it("payNow + pending == owed, payNow <= safeMax, and the breach share at payNow respects epsilon", () => {
    fc.assert(fc.property(scenarioSets, epsilons, fc.bigInt({ min: 0n, max: 3_000n }), (minimums, epsilonBps, proposed) => {
      const f = forecastWith(1_000n, minimums);
      const d = decideSalary(base({ proposed, forecast: f, policy: { epsilonBps, horizonWeeks: 9 } }));
      expect(d.payNow + d.pending).toBe(d.owed);
      expect(d.payNow).toBeLessThanOrEqual(d.safeMax);
      expect(d.payNow).toBeGreaterThanOrEqual(0n);
      if (d.payNow > 0n) expect(breachBps(f, 140n, d.payNow, 9)).toBeLessThanOrEqual(epsilonBps);
      expect(d.breachBps).toBe(breachBps(f, 140n, d.payNow, 9));
    }), { numRuns: 200 });
  });

  it("is maximal: one unit more than safeMax breaks a ceiling or exceeds the salary box", () => {
    fc.assert(fc.property(scenarioSets, epsilons, (minimums, epsilonBps) => {
      const f = forecastWith(1_000n, minimums);
      const d = decideSalary(base({ proposed: 100_000n, salaryBoxBalance: 100_000n, forecast: f, policy: { epsilonBps, horizonWeeks: 9 } }));
      if (d.safeMax > 0n) expect(breachBps(f, 140n, d.safeMax + 1n, 9)).toBeGreaterThan(epsilonBps);
    }), { numRuns: 200 });
  });

  it("a larger buffer never lowers safeMax", () => {
    fc.assert(fc.property(fc.bigInt({ min: 200n, max: 2_000n }), fc.bigInt({ min: 0n, max: 500n }), (buffer, extra) => {
      const make = (b: bigint) => decideSalary(base({ proposed: 100_000n, salaryBoxBalance: 100_000n, bufferBalance: b, forecast: forecastWith(b, Array.from({ length: 50 }, () => b - 50n)) }));
      expect(make(buffer + extra).safeMax).toBeGreaterThanOrEqual(make(buffer).safeMax);
    }), { numRuns: 200 });
  });
});
