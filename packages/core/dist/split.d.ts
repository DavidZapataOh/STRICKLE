import { type Money } from "./money.ts";
export interface Share<K extends string = string> {
    readonly key: K;
    readonly bps: number;
}
export interface Allocation<K extends string = string> {
    readonly key: K;
    readonly amount: Money;
}
export declare function split<K extends string>(total: Money, shares: readonly Share<K>[]): Allocation<K>[];
