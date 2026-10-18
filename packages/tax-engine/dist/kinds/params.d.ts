import { type TaxRule } from "../rule.ts";
export declare const isRecord: (value: unknown) => value is Record<string, unknown>;
export declare function fail(problems: string[]): never;
export declare function localField(source: Record<string, unknown>, field: string): bigint;
export declare function intField(source: Record<string, unknown>, field: string, min: number, max: number): number;
export declare function currencyField(source: Record<string, unknown>): string;
export declare function assertKind(rule: TaxRule, kind: string): void;
