export const ASSETS = ["USDC", "EURC"] as const;
export type Asset = (typeof ASSETS)[number];

export const TOKEN_DECIMALS = 6;
export const NATIVE_DECIMALS = 18;
export const NATIVE_SCALE = 10n ** BigInt(NATIVE_DECIMALS - TOKEN_DECIMALS);
