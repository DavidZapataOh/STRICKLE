import { type Locale, numberLocale } from "@strickle/design/locale";

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * A whole number of dollars typed the way people in each locale write it: "3,200" in English and Latin American Spanish, "3.200" in
 * Brazilian Portuguese. Anything that is not a whole, correctly grouped, non-negative number is null; a decimal part is accepted only when it is zero.
 */
export function parseWholeDollars(text: string, locale: Locale): number | null {
  const parts = new Intl.NumberFormat(numberLocale[locale]).formatToParts(1_000_000.5);
  const group = escape(parts.find((part) => part.type === "group")?.value ?? ",");
  const decimal = escape(parts.find((part) => part.type === "decimal")?.value ?? ".");
  const clean = text.trim().replace(/[\s  ]/g, "");
  const whole = new RegExp(`^(\\d{1,3}(?:${group}\\d{3})+|\\d+)(?:${decimal}0*)?$`).exec(clean);
  if (!whole) return null;
  const number = Number((whole[1] as string).replace(new RegExp(group, "g"), ""));
  return Number.isSafeInteger(number) ? number : null;
}
