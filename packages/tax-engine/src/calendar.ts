import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { addDays, formatPlainDate, isoWeekday, parsePlainDate, type PlainDate } from "@strickle/core";

export type Calendars = Map<string, Set<string>>;

const key = (country: string, year: number) => `${country}:${year}`;

/** Reads `<root>/<COUNTRY>/<year>.json` holiday files; a file that disagrees with its own path is rejected. */
export function loadCalendars(root: string): Calendars {
  const calendars: Calendars = new Map();
  for (const country of readdirSync(root, { withFileTypes: true }).filter((entry) => entry.isDirectory())) {
    for (const file of readdirSync(join(root, country.name)).filter((name) => /^\d{4}\.json$/.test(name))) {
      const label = `${country.name}/${file}`;
      const data = JSON.parse(readFileSync(join(root, country.name, file), "utf8")) as { country?: unknown; year?: unknown; holidays?: unknown };
      const year = Number(file.slice(0, 4));
      if (data.country !== country.name || data.year !== year) throw new Error(`${label}: country or year does not match the path`);
      if (!Array.isArray(data.holidays)) throw new Error(`${label}: holidays must be a list`);
      calendars.set(key(country.name, year), new Set(data.holidays.map((day: unknown) => formatPlainDate(parsePlainDate(String(day))))));
    }
  }
  return calendars;
}

function holidaysOf(calendars: Calendars, country: string, year: number): Set<string> {
  const holidays = calendars.get(key(country, year));
  if (!holidays) throw new Error(`no holiday calendar for ${country} ${year}`);
  return holidays;
}

/** Due dates that fall on a weekend or a holiday move to the next working day. */
export function nextBusinessDay(calendars: Calendars, country: string, date: PlainDate): PlainDate {
  let day = date;
  for (;;) {
    const holidays = holidaysOf(calendars, country, day.year);
    if (isoWeekday(day) < 6 && !holidays.has(formatPlainDate(day))) return day;
    day = addDays(day, 1);
  }
}
