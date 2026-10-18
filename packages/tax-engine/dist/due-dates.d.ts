import { type PlainDate } from "@strickle/core";
import type { TaxRule } from "./rule.ts";
/** The next payment dates of a rule on or after `from`. Weekends and holidays are not moved here: the date is the statutory one. */
export declare function dueDates(rule: TaxRule, from: PlainDate, count: number): PlainDate[];
