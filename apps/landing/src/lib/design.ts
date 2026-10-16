import type { CSSProperties } from "react";
import type { Locale } from "@/i18n/config";
import { numberLocale } from "@/i18n/config";

/** design unit: 1 = 1px on the 1536px-wide approved comps */
export const u = (n: number) => `calc(var(--u) * ${n})`;

/** a unit with a legible floor, for text inside a scaled drawing */
export const fu = (n: number, minPx: number) => `max(calc(var(--u) * ${n}), ${minPx}px)`;

/** inline vars for a .drawing > .canvas of w x h units */
export const canvas = (w: number, h: number): CSSProperties =>
  ({ ["--dw" as string]: w, ["--dh" as string]: h }) as CSSProperties;

export type Box = { x: number; y: number; w: number; h: number };
export const at = ({ x, y, w, h }: Box, extra: CSSProperties = {}): CSSProperties => ({
  position: "absolute",
  left: u(x),
  top: u(y),
  width: u(w),
  height: u(h),
  ...extra,
});

export const APP_URL = "https://app.strickle.xyz";

export function money(amount: number, locale: Locale, sign = false) {
  const n = new Intl.NumberFormat(numberLocale[locale], { maximumFractionDigits: 0 }).format(amount);
  return `${sign ? "+" : ""}US$${n}`;
}
