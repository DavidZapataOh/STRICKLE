import { randomBytes } from "@noble/hashes/utils.js";
export const FIELD_MODULUS = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;
export function assertField(value, name) {
    if (value < 0n || value >= FIELD_MODULUS)
        throw new RangeError(`${name} is not a BN254 field element`);
}
export function assertUint(value, bits, name) {
    if (value < 0n || value >= 1n << BigInt(bits))
        throw new RangeError(`${name} does not fit in ${bits} bits`);
}
export const toHex32 = (value) => `0x${value.toString(16).padStart(64, "0")}`;
/** A uniformly random 248-bit value, always below the field modulus. */
export function randomField() {
    return randomBytes(31).reduce((acc, byte) => (acc << 8n) | BigInt(byte), 0n);
}
