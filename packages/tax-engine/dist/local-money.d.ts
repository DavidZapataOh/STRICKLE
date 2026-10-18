/** Local-currency amounts are `bigint` minor units with two decimals. */
export declare function parseLocal(text: string): bigint;
export declare function formatLocal(minor: bigint): string;
export declare function applyRateBps(minor: bigint, rateBps: number): bigint;
