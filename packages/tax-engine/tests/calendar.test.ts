import { plainDate } from "@strickle/core";
import { describe, expect, it } from "vitest";
import { loadCalendars, nextBusinessDay } from "../src/index.ts";

const calendars = loadCalendars(new URL("../calendars", import.meta.url).pathname);
const d = plainDate;

describe("nextBusinessDay", () => {
  it("keeps a plain working day", () => {
    expect(nextBusinessDay(calendars, "MX", d(2026, 11, 17))).toEqual(d(2026, 11, 17));
  });

  it("moves a Saturday and a Sunday to Monday", () => {
    expect(nextBusinessDay(calendars, "US", d(2026, 10, 17))).toEqual(d(2026, 10, 19));
    expect(nextBusinessDay(calendars, "US", d(2026, 10, 18))).toEqual(d(2026, 10, 19));
  });

  it("moves a Monday holiday that follows a weekend", () => {
    expect(nextBusinessDay(calendars, "MX", d(2026, 11, 14))).toEqual(d(2026, 11, 17));
    expect(nextBusinessDay(calendars, "MX", d(2026, 11, 16))).toEqual(d(2026, 11, 17));
  });

  it("walks through consecutive holidays", () => {
    expect(nextBusinessDay(calendars, "AR", d(2026, 2, 16))).toEqual(d(2026, 2, 18));
    expect(nextBusinessDay(calendars, "AR", d(2026, 4, 2))).toEqual(d(2026, 4, 6));
  });

  it("uses each country's own holidays", () => {
    expect(nextBusinessDay(calendars, "CO", d(2026, 11, 2))).toEqual(d(2026, 11, 3));
    expect(nextBusinessDay(calendars, "MX", d(2026, 11, 2))).toEqual(d(2026, 11, 2));
  });

  it("crosses a year boundary using the next year's file", () => {
    expect(nextBusinessDay(calendars, "MX", d(2026, 12, 25))).toEqual(d(2026, 12, 28));
    expect(nextBusinessDay(calendars, "US", d(2026, 12, 31))).toEqual(d(2026, 12, 31));
    expect(nextBusinessDay(calendars, "US", d(2027, 1, 1))).toEqual(d(2027, 1, 4));
  });

  it("fails loudly for a country or year without a holiday file", () => {
    expect(() => nextBusinessDay(calendars, "MX", d(2031, 3, 3))).toThrow(/no holiday calendar for MX 2031/);
    expect(() => nextBusinessDay(calendars, "PK", d(2026, 3, 3))).toThrow(/no holiday calendar for PK 2026/);
  });
});

describe("loadCalendars", () => {
  it("rejects a file whose country or year disagrees with its path", async () => {
    const { mkdtempSync, mkdirSync, writeFileSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const root = mkdtempSync(join(tmpdir(), "cal-"));
    mkdirSync(join(root, "MX"));
    writeFileSync(join(root, "MX", "2026.json"), JSON.stringify({ country: "CO", year: 2026, holidays: [], businessDayRule: "next", source: { title: "t", url: "https://x.org/", retrievedOn: "2026-10-15" } }));
    expect(() => loadCalendars(root)).toThrow(/MX\/2026\.json/);
  });
});
