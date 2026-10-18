import { type Money } from "./money.ts";
export type RoundingMode = "floor" | "ceil" | "halfEven";
export declare function mulDiv(a: bigint, b: bigint, d: bigint, mode: RoundingMode): bigint;
export declare function portion(total: Money, numerator: bigint, denominator: bigint, mode: RoundingMode): {
    part: Money;
    rest: Money;
};
