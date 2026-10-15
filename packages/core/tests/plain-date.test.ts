import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { BOX_KINDS } from "../src/box.ts";
import {
  addDays,
  addMonths,
  daysBetween,
  daysInMonth,
  formatPlainDate,
  fromEpochDay,
  isoWeekday,
  parsePlainDate,
  plainDate,
  toEpochDay,
} from "../src/plain-date.ts";

const d = parsePlainDate;
const iso = formatPlainDate;

describe("box kinds", () => {
  it("lists the six boxes", () => {
    expect(BOX_KINDS).toEqual(["taxes", "payroll", "salary", "operating", "emergency", "profit"]);
  });
});

describe("plain dates", () => {
  it("parses and formats ISO dates", () => {
    expect(d("2026-10-15")).toEqual({ year: 2026, month: 10, day: 15 });
    expect(iso({ year: 987, month: 3, day: 4 })).toBe("0987-03-04");
  });

  it.each(["2026-02-30", "2026-13-01", "2026-00-10", "2026-10-00", "2026-1-5", "26-10-15", "2026-10-15T00:00", ""])(
    "rejects %j",
    (text) => {
      expect(() => parsePlainDate(text)).toThrow(RangeError);
    },
  );

  it("knows leap years, including the century rules", () => {
    expect(daysInMonth(2028, 2)).toBe(29);
    expect(daysInMonth(2026, 2)).toBe(28);
    expect(daysInMonth(1900, 2)).toBe(28);
    expect(daysInMonth(2000, 2)).toBe(29);
    expect(daysInMonth(2100, 2)).toBe(28);
    expect(() => plainDate(2026, 2, 29)).toThrow(RangeError);
  });

  it("matches JavaScript's Date for every day from year 1000 to 9999", () => {
    fc.assert(
      fc.property(fc.integer({ min: -354_285, max: 2_932_896 }), (epochDay) => {
        const date = new Date(epochDay * 86_400_000);
        const expected = { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() };
        expect(fromEpochDay(epochDay)).toEqual(expected);
        expect(toEpochDay(expected)).toBe(epochDay);
        expect(isoWeekday(expected)).toBe(date.getUTCDay() || 7);
      }),
    );
  });

  it("anchors the epoch and today's weekday", () => {
    expect(toEpochDay(d("1970-01-01"))).toBe(0);
    expect(toEpochDay(d("1969-12-31"))).toBe(-1);
    expect(isoWeekday(d("2026-10-15"))).toBe(4);
  });

  it("adds days across month, year and leap boundaries", () => {
    expect(iso(addDays(d("2026-12-31"), 1))).toBe("2027-01-01");
    expect(iso(addDays(d("2028-02-28"), 1))).toBe("2028-02-29");
    expect(iso(addDays(d("2026-03-01"), -1))).toBe("2026-02-28");
    expect(daysBetween(d("2026-10-15"), d("2026-11-10"))).toBe(26);
  });

  it("adds months and clamps to the end of a shorter month", () => {
    expect(iso(addMonths(d("2026-01-31"), 1))).toBe("2026-02-28");
    expect(iso(addMonths(d("2028-01-31"), 1))).toBe("2028-02-29");
    expect(iso(addMonths(d("2026-03-31"), -1))).toBe("2026-02-28");
    expect(iso(addMonths(d("2026-11-15"), 3))).toBe("2027-02-15");
    expect(iso(addMonths(d("2026-10-15"), 12))).toBe("2027-10-15");
  });

  it("adding and removing the same days returns the original date", () => {
    fc.assert(
      fc.property(fc.integer({ min: -354_285, max: 2_900_000 }), fc.integer({ min: -30_000, max: 30_000 }), (epochDay, n) => {
        const date = fromEpochDay(epochDay);
        expect(addDays(addDays(date, n), -n)).toEqual(date);
        expect(daysBetween(date, addDays(date, n))).toBe(n);
      }),
    );
  });
});
