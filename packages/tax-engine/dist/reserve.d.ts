import { type PlainDate } from "@strickle/core";
import { type TaxRule, type Verification } from "./rule.ts";
import { type FallbackReserve } from "./kinds/fallback.ts";
import { FLAT_RATE_KIND, type FlatRateInput } from "./kinds/flat-rate.ts";
import { MEI_KIND, type MeiInput } from "./kinds/mei.ts";
import { MONOTRIBUTO_KIND, type MonotributoInput } from "./kinds/monotributo.ts";
import { RESICO_KIND, type ResicoInput } from "./kinds/resico.ts";
import { SAFE_HARBOR_KIND, type SafeHarborInput } from "./kinds/safe-harbor.ts";
import { SIMPLE_KIND, type SimpleInput } from "./kinds/simple.ts";
export type RegimeInput = {
    kind: typeof RESICO_KIND;
    input: ResicoInput;
} | {
    kind: typeof MONOTRIBUTO_KIND;
    input: MonotributoInput;
} | {
    kind: typeof SIMPLE_KIND;
    input: SimpleInput;
} | {
    kind: typeof MEI_KIND;
    input: MeiInput;
} | {
    kind: typeof SAFE_HARBOR_KIND;
    input: SafeHarborInput;
} | {
    kind: typeof FLAT_RATE_KIND;
    input: FlatRateInput;
};
export interface ReserveRequest {
    country: string;
    today: PlainDate;
    yearToDate: bigint;
    lastYear: {
        income: bigint;
        tax: bigint;
    };
    /** Inputs of the country's regime; without them the fallback is used. */
    regime?: RegimeInput;
}
export type FallbackReason = "no-rule" | "rule-expired" | "regime-input-missing" | "out-of-regime";
interface Common {
    country: string;
    amount: bigint;
    ruleId: string;
    source: TaxRule["source"];
    verification: Verification;
}
export type Reserve = (Common & {
    origin: "rule";
    regime: string;
}) | (Common & {
    origin: "fallback";
    reason: FallbackReason;
    basis: FallbackReserve["basis"];
});
/** The amount to set aside for the country's next payment: from its current rule when the regime inputs are given, else the fallback estimate. */
export declare function reserveFor(rules: readonly TaxRule[], request: ReserveRequest): Reserve;
/** Countries with a current rule, and countries whose rules have all expired (these are on the fallback). */
export declare function coverage(rules: readonly TaxRule[], today: PlainDate): {
    withRule: string[];
    expired: string[];
};
export {};
