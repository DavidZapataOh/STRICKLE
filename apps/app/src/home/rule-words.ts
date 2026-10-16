import { formatMoney } from "@strickle/design/format";
import type { Locale } from "@strickle/design/locale";
import { describeRule } from "@/chain/rules";
import type { BoxRule } from "@/chain/totals";
import { fill } from "@/i18n/fill";
import type { Dictionary } from "@/i18n/dictionaries";
import { dateText, isoDay } from "./format";

/** A box rule in the user's words, the same on every screen that shows one. */
export function ruleWords(rule: BoxRule, now: number, lang: Locale, text: Dictionary["boxesPage"]): string {
  return describeRule(rule, now)
    .map((line) => {
      switch (line.key) {
        case "locked": return fill(text.locked, { date: dateText(isoDay(line.until), lang) });
        case "always": return fill(text.always, { hours: line.hours });
        case "below": return fill(text.below, { floor: formatMoney(line.floor, lang), hours: line.hours });
        case "restricted": return text.restricted;
        case "free": return text.free;
      }
    })
    .join(" · ");
}
