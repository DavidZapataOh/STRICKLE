import { addDays, parsePlainDate } from "@strickle/core";
import { describe, expect, it } from "vitest";
import { type CashEntry, populatedWeeks } from "../src/forecast.ts";

const asOf = parsePlainDate("2026-10-15");
const entry = (daysAgo: number): CashEntry => ({ date: addDays(asOf, -daysAgo), amount: 1_000_000n, source: "acme" });

describe("populatedWeeks", () => {
  it("is 0 for an empty history", () => {
    expect(populatedWeeks([], asOf)).toBe(0);
  });
  it("counts each week once however many entries it has", () => {
    expect(populatedWeeks([entry(0), entry(3), entry(6)], asOf)).toBe(1);
    expect(populatedWeeks([entry(0), entry(7), entry(14)], asOf)).toBe(3);
  });
  it("keeps day 90 (week 12) and drops day 91 and future dates", () => {
    expect(populatedWeeks([entry(90)], asOf)).toBe(1);
    expect(populatedWeeks([entry(91)], asOf)).toBe(0);
    expect(populatedWeeks([entry(-1)], asOf)).toBe(0);
  });
  it("is 13 when every week has an entry", () => {
    expect(populatedWeeks(Array.from({ length: 13 }, (_, week) => entry(week * 7)), asOf)).toBe(13);
  });
});
