import { ristretto255 } from "@noble/curves/ed25519.js";
import { hkdf } from "@noble/hashes/hkdf.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { randomBytes } from "@noble/hashes/utils.js";

export const Point = ristretto255.Point;
export const ORDER = Point.Fn.ORDER;

export interface ViewKey {
  secret: bigint;
  publicKey: Uint8Array;
}

const toBigint = (bytes: Uint8Array): bigint => bytes.reduce((acc, byte) => (acc << 8n) | BigInt(byte), 0n);

/** Maps bytes to a uniform-enough scalar in 1..ORDER-1 (64 input bytes make the bias negligible). */
export const scalarFromBytes = (bytes: Uint8Array): bigint => (toBigint(bytes) % (ORDER - 1n)) + 1n;

export function viewKeyFromSecret(secret: bigint): ViewKey {
  return { secret, publicKey: Point.BASE.multiply(secret).toBytes() };
}

export const generateViewKey = (): ViewKey => viewKeyFromSecret(scalarFromBytes(randomBytes(64)));

/** The owner's view key follows the spend secret, so a restored wallet needs nothing else. */
export function deriveOwnerViewKey(sk: bigint): ViewKey {
  const ikm = Uint8Array.from({ length: 32 }, (_, i) => Number((sk >> BigInt(8 * (31 - i))) & 0xffn));
  const okm = hkdf(sha256, ikm, undefined, new TextEncoder().encode("strickle/view/owner/v1"), 64);
  return viewKeyFromSecret(scalarFromBytes(okm));
}

export const keyId = (publicKey: Uint8Array): Uint8Array => sha256(publicKey).slice(0, 4);
