import { formatDate } from "@strickle/design/format";
import type { Locale } from "@strickle/design/locale";

/** A date that came from outside the app is shown as it is when it is not a real calendar day, never as a crash. */
export function dateText(iso: string, lang: Locale): string {
  try {
    return formatDate(iso, lang);
  } catch {
    return iso;
  }
}

export const isoDay = (seconds: number): string => new Date(seconds * 1000).toISOString().slice(0, 10);
