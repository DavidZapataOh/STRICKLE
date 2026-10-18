import { type Asset } from "./asset.ts";
import { type Money } from "./money.ts";
export declare function parseDecimal(asset: Asset, text: string): Money;
export declare function formatDecimal({ units }: Money): string;
export declare function fromNative(nativeUnits: bigint): {
    money: Money;
    dust: bigint;
};
export declare function toNative({ asset, units }: Money): bigint;
