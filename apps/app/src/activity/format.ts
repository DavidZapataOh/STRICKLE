import { type Address, type Hex } from "viem";

export const shortAddress = (address: Address): string => `${address.slice(0, 6)}…${address.slice(-4)}`;
export const shortDigest = (digest: Hex): string => `${digest.slice(2, 10)}…${digest.slice(-8)}`;
export const isoDay = (epochSeconds: number): string => new Date(epochSeconds * 1000).toISOString().slice(0, 10);
