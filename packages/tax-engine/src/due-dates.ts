import { type PlainDate, addMonths, plainDate } from "@strickle/core";
import { FLAT_RATE_KIND, parseFlatRateParams } from "./kinds/flat-rate.ts";
import { MEI_KIND, parseMeiParams } from "./kinds/mei.ts";
import { MONOTRIBUTO_KIND, parseMonotributoParams } from "./kinds/monotributo.ts";
import { RESICO_KIND, parseResicoParams } from "./kinds/resico.ts";
import { SAFE_HARBOR_KIND, parseSafeHarborParams } from "./kinds/safe-harbor.ts";
import type { TaxRule } from "./rule.ts";

const order = (date: PlainDate) => date.year * 10_000 + date.month * 100 + date.day;
const notBefore = (date: PlainDate, from: PlainDate) => order(date) >= order(from);

function monthly(day: number, from: PlainDate, count: number): PlainDate[] {
  const dates: PlainDate[] = [];
  let month = plainDate(from.year, from.month, 1);
  while (dates.length < count) {
    const due = plainDate(month.year, month.month, day);
    if (notBefore(due, from)) dates.push(due);
    month = addMonths(month, 1);
  }
  return dates;
}

/** The next payment dates of a rule on or after `from`. Weekends and holidays are not moved here: the date is the statutory one. */
export function dueDates(rule: TaxRule, from: PlainDate, count: number): PlainDate[] {
  if (count <= 0) return [];
  switch (rule.kind) {
    case RESICO_KIND:
      return monthly(parseResicoParams(rule.params).dueDay, from, count);
    case MONOTRIBUTO_KIND:
      return monthly(parseMonotributoParams(rule.params).dueDay, from, count);
    case MEI_KIND:
      return monthly(parseMeiParams(rule.params).dueDay, from, count);
    case SAFE_HARBOR_KIND:
      return parseSafeHarborParams(rule.params).dueDates.filter((date) => notBefore(date, from)).slice(0, count);
    case FLAT_RATE_KIND: {
      const params = parseFlatRateParams(rule.params);
      const taxYears = Array.from({ length: rule.validTo.year - rule.validFrom.year + 1 }, (_, i) => rule.validFrom.year + i);
      return taxYears
        .flatMap((taxYear) => params.dueDates.map((entry) => plainDate(taxYear + entry.yearOffset, entry.month, entry.day)))
        .filter((date) => notBefore(date, from))
        .sort((a, b) => order(a) - order(b))
        .slice(0, count);
    }
    default:
      return [];
  }
}
