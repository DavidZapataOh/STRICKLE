import { type PlainDate } from "@strickle/core";
export type Calendars = Map<string, Set<string>>;
/** Reads `<root>/<COUNTRY>/<year>.json` holiday files; a file that disagrees with its own path is rejected. */
export declare function loadCalendars(root: string): Calendars;
/** Due dates that fall on a weekend or a holiday move to the next working day. */
export declare function nextBusinessDay(calendars: Calendars, country: string, date: PlainDate): PlainDate;
