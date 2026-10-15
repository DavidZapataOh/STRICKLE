import fc from "fast-check";
import { addDays, parsePlainDate } from "@strickle/core";
import { describe, expect, it } from "vitest";
import { type CashEntry, decompose } from "../src/forecast.ts";

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
