import { type Locale, numberLocale } from "@strickle/design/locale";

const ENTRY = /^(\d*)(?:\.(\d{0,6}))?$/;
const MIN_UNITS = 10_000n; // one cent
const MAX_UNITS = 1_000_000_000_000_000n; // 1,000,000,000 whole units

/** What a person types in the amount field, as six-decimal base units; null for anything that is not a plain positive amount. */
export function parseAmountInput(text: string): bigint | null {
  const match = ENTRY.exec(text);
  if (!match) return null;
  const [, whole = "", fraction = ""] = match;
  if (whole === "" && fraction === "") return null;
  const units = BigInt(whole || "0") * 1_000_000n + BigInt(fraction.padEnd(6, "0") || "0");
  return units >= MIN_UNITS && units <= MAX_UNITS ? units : null;
}

/** Two decimals in the locale's own separators, rounded half away from zero like formatMoney, with the token's symbol after. */
export function formatTokenAmount(units: bigint, symbol: "USDC" | "USDT", lang: Locale): string {
  const cents = (units + 5_000n) / 10_000n;
  const locale = numberLocale[lang];
  const whole = new Intl.NumberFormat(locale, { useGrouping: true, maximumFractionDigits: 0 }).format(cents / 100n);
  const decimal = new Intl.NumberFormat(locale).formatToParts(1.1).find((part) => part.type === "decimal")?.value ?? ".";
  return `${whole}${decimal}${(cents % 100n).toString().padStart(2, "0")} ${symbol}`;
}

/** Base units as a plain decimal string with up to six decimals and no trailing zeros ("99.4", "25"): what the server's amount field parses. */
export function formatUnits6(units: bigint): string {
  const whole = units / 1_000_000n;
  const fraction = (units % 1_000_000n).toString().padStart(6, "0").replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : `${whole}`;
}
