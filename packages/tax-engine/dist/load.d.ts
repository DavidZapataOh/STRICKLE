import { type PlainDate } from "@strickle/core";
import { type TaxRule } from "./rule.ts";
/** Reads `<root>/<COUNTRY>/<rule>.json` files; any invalid file, duplicate id or misfiled rule fails the whole load. */
export declare function loadRules(root: string): TaxRule[];
/** Fails naming every rule that is not valid on `today`, so stale rules never ship silently. */
export declare function assertCurrent(rules: readonly TaxRule[], today: PlainDate): void;
