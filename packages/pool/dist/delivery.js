import { DOMAIN } from "./constants.js";
import { FIELD_MODULUS, assertUint } from "./field.js";
import { hash } from "./poseidon.js";
export const deliveryKey = (nk, nullifier0, index) => hash([DOMAIN.DELIVERY_KEY, nk, nullifier0, BigInt(index)]);
export const deliverySalt = (key) => hash([DOMAIN.DELIVERY_SALT, key]);
export const deliveryPad = (key) => hash([DOMAIN.DELIVERY_PAD, key]);
export function packDelivery({ amount, flags, lockUntil, delayFloor }) {
    assertUint(amount, 64, "amount");
    assertUint(lockUntil, 64, "lockUntil");
    assertUint(BigInt(delayFloor), 32, "delayFloor");
    if (!Number.isInteger(flags) || flags < 0 || flags > 1)
        throw new RangeError("flags must be 0 or 1");
    return amount + (BigInt(flags) << 64n) + (lockUntil << 72n) + (BigInt(delayFloor) << 136n);
}
export function unpackDelivery(m) {
    if (m < 0n || m >= 1n << 168n)
        return undefined;
    const flags = (m >> 64n) & 0xffn;
    if (flags > 1n)
        return undefined;
    return { amount: m & ((1n << 64n) - 1n), flags: Number(flags), lockUntil: (m >> 72n) & ((1n << 64n) - 1n), delayFloor: Number(m >> 136n) };
}
export const encryptDelivery = (m, key) => (m + deliveryPad(key)) % FIELD_MODULUS;
export const decryptDelivery = (enc, key) => (enc - deliveryPad(key) + FIELD_MODULUS) % FIELD_MODULUS;
