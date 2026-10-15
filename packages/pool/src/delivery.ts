import { DOMAIN } from "./constants.ts";
import { FIELD_MODULUS, assertUint } from "./field.ts";
import { hash } from "./poseidon.ts";

export const deliveryKey = (nk: bigint, nullifier0: bigint, index: number): bigint =>
  hash([DOMAIN.DELIVERY_KEY, nk, nullifier0, BigInt(index)]);
export const deliverySalt = (key: bigint): bigint => hash([DOMAIN.DELIVERY_SALT, key]);
export const deliveryPad = (key: bigint): bigint => hash([DOMAIN.DELIVERY_PAD, key]);

export interface Delivery {
  amount: bigint;
  flags: number;
  lockUntil: bigint;
}

export function packDelivery({ amount, flags, lockUntil }: Delivery): bigint {
  assertUint(amount, 64, "amount");
  assertUint(lockUntil, 64, "lockUntil");
  if (!Number.isInteger(flags) || flags < 0 || flags > 1) throw new RangeError("flags must be 0 or 1");
  return amount + (BigInt(flags) << 64n) + (lockUntil << 72n);
}

export function unpackDelivery(m: bigint): Delivery | undefined {
  if (m < 0n || m >= 1n << 136n) return undefined;
  const flags = (m >> 64n) & 0xffn;
  if (flags > 1n) return undefined;
  return { amount: m & ((1n << 64n) - 1n), flags: Number(flags), lockUntil: m >> 72n };
}

export const encryptDelivery = (m: bigint, key: bigint): bigint => (m + deliveryPad(key)) % FIELD_MODULUS;
export const decryptDelivery = (enc: bigint, key: bigint): bigint => (enc - deliveryPad(key) + FIELD_MODULUS) % FIELD_MODULUS;
