import type { Asset } from "./asset.ts";
export interface Money {
    readonly asset: Asset;
    readonly units: bigint;
}
export declare class AssetMismatchError extends Error {
    constructor(left: Asset, right: Asset);
}
export declare const money: (asset: Asset, units: bigint) => Money;
export declare function add(a: Money, b: Money): Money;
export declare function sub(a: Money, b: Money): Money;
export declare function compare(a: Money, b: Money): -1 | 0 | 1;
export declare function sum(asset: Asset, items: readonly Money[]): Money;
