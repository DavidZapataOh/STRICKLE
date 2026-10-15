import { readFileSync } from "node:fs";
import { daysBetween, plainDate } from "@strickle/core";
import { describe, expect, it } from "vitest";
import { adverseMoveBps, conversionSchedule, fxReserve, loadCalendars, planReserve } from "../src/index.ts";

const fixture = JSON.parse(readFileSync(new URL("./fixtures/fx-usd.json", import.meta.url), "utf8")) as { series: Record<string, [string, number][]> };
const rates = (currency: string) => fixture.series[currency]!.map(([, rate]) => rate);

describe("adverseMoveBps", () => {
  it("takes the 5th percentile of horizon returns, rounded up to whole basis points", () => {
    const series = [100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 90, 100];
    expect(adverseMoveBps(series, 1)).toBe(1000);
  });

  it("uses the second-worst return when the quantile falls between observations", () => {
    const series = Array.from({ length: 26 }, () => 100);
    series[10] = 80;
    series[20] = 90;
    expect(adverseMoveBps(series, 1)).toBe(1000);
  });

  it("is zero when the local currency never appreciated", () => {
    expect(adverseMoveBps(Array.from({ length: 30 }, (_, i) => 10 + i), 2)).toBe(0);
  });

  it("rejects a horizon the series cannot support, short series and bad rates", () => {
    const flat = Array.from({ length: 30 }, () => 18);
    expect(() => adverseMoveBps(flat, 0)).toThrow(RangeError);
    expect(() => adverseMoveBps(flat, 30)).toThrow(RangeError);
    expect(() => adverseMoveBps([18, 18, 18], 1)).toThrow(RangeError);
    expect(() => adverseMoveBps([...flat.slice(1), 0], 1)).toThrow(RangeError);
  });
});

describe("fxReserve", () => {
  it("equals the liability at spot when there is no adverse move", () => {
    expect(fxReserve({ liability: 1_850_000n, spot: "18.5", adverseBps: 0 })).toBe(1_000_000_000n);
  });

  it("grows by the adverse move and rounds up", () => {
    expect(fxReserve({ liability: 1_850_000n, spot: "18.5", adverseBps: 1000 })).toBe(1_111_111_112n);
  });

  it("is zero for no liability and never below the liability at spot", () => {
    expect(fxReserve({ liability: 0n, spot: "18.5", adverseBps: 500 })).toBe(0n);
    expect(fxReserve({ liability: 777n, spot: "5.057", adverseBps: 0 })).toBeGreaterThanOrEqual((777n * 10_000_000n) / 5_057n);
  });

  it("rejects non-positive spot, a move of 100% or more and a negative liability", () => {
    expect(() => fxReserve({ liability: 1n, spot: "0", adverseBps: 0 })).toThrow(RangeError);
    expect(() => fxReserve({ liability: 1n, spot: "x", adverseBps: 0 })).toThrow(RangeError);
    expect(() => fxReserve({ liability: 1n, spot: "1", adverseBps: 10_000 })).toThrow(RangeError);
    expect(() => fxReserve({ liability: -1n, spot: "1", adverseBps: 0 })).toThrow(RangeError);
  });
});

describe("conversionSchedule", () => {
  const today = plainDate(2026, 10, 15);

  it("splits the reserve evenly, ends before the due date and loses no unit", () => {
    const schedule = conversionSchedule({ today, dueDate: plainDate(2026, 11, 17), reserve: 1_000_001n, tranches: 4 });
    expect(schedule).toHaveLength(4);
    expect(schedule.reduce((sum, item) => sum + item.amount, 0n)).toBe(1_000_001n);
    expect(schedule[0]!.date).toEqual(today);
    expect(daysBetween(schedule.at(-1)!.date, plainDate(2026, 11, 17))).toBeGreaterThanOrEqual(1);
    schedule.forEach((item, i) => {
      if (i > 0) expect(daysBetween(schedule[i - 1]!.date, item.date)).toBeGreaterThan(0);
    });
  });

  it("converts everything today when the due date is today or tomorrow", () => {
    expect(conversionSchedule({ today, dueDate: today, reserve: 5n, tranches: 4 })).toEqual([{ date: today, amount: 5n }]);
    expect(conversionSchedule({ today, dueDate: plainDate(2026, 10, 16), reserve: 5n, tranches: 4 })).toEqual([{ date: today, amount: 5n }]);
  });

  it("uses fewer tranches than asked when there are fewer days", () => {
    expect(conversionSchedule({ today, dueDate: plainDate(2026, 10, 18), reserve: 9n, tranches: 8 })).toHaveLength(3);
  });

  it("returns nothing for a zero reserve and rejects a past due date", () => {
    expect(conversionSchedule({ today, dueDate: plainDate(2026, 11, 1), reserve: 0n, tranches: 3 })).toEqual([]);
    expect(() => conversionSchedule({ today, dueDate: plainDate(2026, 10, 14), reserve: 1n, tranches: 3 })).toThrow(RangeError);
    expect(() => conversionSchedule({ today, dueDate: plainDate(2026, 11, 1), reserve: 1n, tranches: 0 })).toThrow(RangeError);
  });
});

describe("backtest on real ECB history", () => {
  it.each(["MXN", "BRL"])("a 30-day reserve sized from the prior three years covers %s at least 93% of the time", (currency) => {
    const series = rates(currency);
    const horizon = 21;
    const window = 750;
    let covered = 0;
    let total = 0;
    for (let t = window; t + horizon < series.length; t += 5) {
      const adverse = adverseMoveBps(series.slice(t - window, t), horizon);
      const needed = series[t]! / series[t + horizon]!;
      const provided = 1 / (1 - adverse / 10_000);
      total += 1;
      if (provided >= needed) covered += 1;
    }
    expect(covered / total).toBeGreaterThanOrEqual(0.93);
  });
});

describe("planReserve", () => {
  const calendars = loadCalendars(new URL("../calendars", import.meta.url).pathname);

  it("nets withholdings, moves the due date to a working day and sizes the USD reserve", () => {
    const plan = planReserve({
      country: "MX",
      calendars,
      today: plainDate(2026, 11, 2),
      nominalDue: plainDate(2026, 11, 16),
      liability: 2_000_00n,
      withheld: [500_00n],
      spot: "18.5",
      series: rates("MXN"),
      tranches: 3,
    });
    expect(plan.dueDate).toEqual(plainDate(2026, 11, 17));
    expect(plan.due).toBe(1_500_00n);
    expect(plan.credit).toBe(0n);
    expect(plan.reserve).toBeGreaterThanOrEqual(fxReserve({ liability: 1_500_00n, spot: "18.5", adverseBps: 0 }));
    expect(plan.schedule.reduce((sum, item) => sum + item.amount, 0n)).toBe(plan.reserve);
  });

  it("needs no reserve when withholdings cover the liability", () => {
    const plan = planReserve({ country: "MX", calendars, today: plainDate(2026, 11, 2), nominalDue: plainDate(2026, 11, 17), liability: 100n, withheld: [300n], spot: "18.5", series: rates("MXN"), tranches: 3 });
    expect(plan.reserve).toBe(0n);
    expect(plan.credit).toBe(200n);
    expect(plan.schedule).toEqual([]);
  });
});
