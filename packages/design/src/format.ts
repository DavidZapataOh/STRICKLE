import { type Locale, numberLocale } from "./locale.ts";

const MINUS = "\u2212";
const SYMBOL = { USDC: "US$", EURC: "€" } as const;
// Brazilian Portuguese writes a space after the dollar code; English and es-419 do not.
const SPACED: Record<Locale, boolean> = { en: false, es: false, "pt-br": true };

export function formatMoney(units: bigint, locale: Locale, options: { asset?: "USDC" | "EURC"; signed?: boolean } = {}): string {
  const asset = options.asset ?? "USDC";
  const abs = units < 0n ? -units : units;
  // six-decimal base units to cents, rounding half away from zero
  const cents = (abs + 5_000n) / 10_000n;
  const whole = cents / 100n;
  const fraction = cents % 100n;
  const format = new Intl.NumberFormat(numberLocale[locale], { useGrouping: true, maximumFractionDigits: 0 });
  const decimal = new Intl.NumberFormat(numberLocale[locale]).formatToParts(1.1).find((part) => part.type === "decimal")?.value ?? ".";
  const body = `${format.format(whole)}${decimal}${fraction.toString().padStart(2, "0")}`;
  const spaced = asset === "USDC" && SPACED[locale] ? " " : "";
  // the sign follows the rounded value: -1 base unit is "US$0.00", never "-US$0.00"
  const sign = cents === 0n ? "" : units < 0n ? MINUS : options.signed ? "+" : "";
  return `${sign}${SYMBOL[asset]}${spaced}${body}`;
}

const ISO = /^(\d{4})-(\d{2})-(\d{2})$/;

export function formatDate(isoDate: string, locale: Locale, style: "short" | "long" = "short"): string {
  const match = ISO.exec(isoDate);
  if (!match) throw new Error(`not a calendar date: ${isoDate}`);
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) throw new Error(`not a calendar date: ${isoDate}`);
  const options: Intl.DateTimeFormatOptions =
    style === "long" ? { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" } : { month: "short", day: "numeric", timeZone: "UTC" };
  return new Intl.DateTimeFormat(numberLocale[locale], options).format(date);
}

export function formatPercent(bps: number, locale: Locale): string {
  return new Intl.NumberFormat(numberLocale[locale], { style: "percent", maximumFractionDigits: 2 }).format(bps / 10_000);
}
