export interface PlainDate {
  readonly year: number;
  readonly month: number;
  readonly day: number;
}

const isLeap = (year: number) => (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;

export function daysInMonth(year: number, month: number): number {
  if (month === 2) return isLeap(year) ? 29 : 28;
  return month === 4 || month === 6 || month === 9 || month === 11 ? 30 : 31;
}

export function plainDate(year: number, month: number, day: number): PlainDate {
  const valid =
    Number.isInteger(year) &&
    Number.isInteger(month) &&
    Number.isInteger(day) &&
    month >= 1 &&
    month <= 12 &&
    day >= 1 &&
    day <= daysInMonth(year, month);
  if (!valid) throw new RangeError(`invalid date ${year}-${month}-${day}`);
  return { year, month, day };
}

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function parsePlainDate(text: string): PlainDate {
  const match = ISO_DATE.exec(text);
  if (!match) throw new RangeError(`not an ISO date: "${text}"`);
  return plainDate(Number(match[1]), Number(match[2]), Number(match[3]));
}

export function formatPlainDate({ year, month, day }: PlainDate): string {
  const pad = (n: number, width: number) => String(n).padStart(width, "0");
  return `${pad(year, 4)}-${pad(month, 2)}-${pad(day, 2)}`;
}

// Civil-from-days algorithm (H. Hinnant); exact for the whole proleptic Gregorian calendar.
export function toEpochDay({ year, month, day }: PlainDate): number {
  const y = month <= 2 ? year - 1 : year;
  const era = Math.floor(y / 400);
  const yearOfEra = y - era * 400;
  const dayOfYear = Math.floor((153 * (month + (month > 2 ? -3 : 9)) + 2) / 5) + day - 1;
  const dayOfEra = yearOfEra * 365 + Math.floor(yearOfEra / 4) - Math.floor(yearOfEra / 100) + dayOfYear;
  return era * 146_097 + dayOfEra - 719_468;
}

export function fromEpochDay(epochDay: number): PlainDate {
  const z = epochDay + 719_468;
  const era = Math.floor(z / 146_097);
  const dayOfEra = z - era * 146_097;
  const yearOfEra = Math.floor(
    (dayOfEra - Math.floor(dayOfEra / 1460) + Math.floor(dayOfEra / 36_524) - Math.floor(dayOfEra / 146_096)) / 365,
  );
  const dayOfYear = dayOfEra - (365 * yearOfEra + Math.floor(yearOfEra / 4) - Math.floor(yearOfEra / 100));
  const monthIndex = Math.floor((5 * dayOfYear + 2) / 153);
  const day = dayOfYear - Math.floor((153 * monthIndex + 2) / 5) + 1;
  const month = monthIndex < 10 ? monthIndex + 3 : monthIndex - 9;
  const year = yearOfEra + era * 400 + (month <= 2 ? 1 : 0);
  return { year, month, day };
}

export function addDays(date: PlainDate, days: number): PlainDate {
  if (!Number.isInteger(days)) throw new RangeError(`days must be an integer, got ${days}`);
  return fromEpochDay(toEpochDay(date) + days);
}

export function addMonths(date: PlainDate, months: number): PlainDate {
  if (!Number.isInteger(months)) throw new RangeError(`months must be an integer, got ${months}`);
  const index = date.year * 12 + (date.month - 1) + months;
  const year = Math.floor(index / 12);
  const month = index - year * 12 + 1;
  return { year, month, day: Math.min(date.day, daysInMonth(year, month)) };
}

export function daysBetween(from: PlainDate, to: PlainDate): number {
  return toEpochDay(to) - toEpochDay(from);
}

export function isoWeekday(date: PlainDate): number {
  return ((((toEpochDay(date) + 3) % 7) + 7) % 7) + 1;
}
