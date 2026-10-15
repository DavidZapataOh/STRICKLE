import { chacha20poly1305 } from "@noble/ciphers/chacha.js";
import { ristretto255 } from "@noble/curves/ed25519.js";
import { hkdf } from "@noble/hashes/hkdf.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { randomBytes } from "@noble/hashes/utils.js";

const Point = ristretto255.Point;
const ORDER = Point.Fn.ORDER;
const VERSION = 1;
const INFO = new TextEncoder().encode("strickle/sealed/v1");
const NONCE = new Uint8Array(12);

const toBigint = (bytes: Uint8Array): bigint => bytes.reduce((acc, byte) => (acc << 8n) | BigInt(byte), 0n);
const randomScalar = (): bigint => scalarFrom(randomBytes(64));

export interface ProverKey {
  secret: bigint;
  publicKey: Uint8Array;
}

export function generateProverKey(): ProverKey {
  const secret = randomScalar();
  return { secret, publicKey: Point.BASE.multiply(secret).toBytes() };
}

const concat = (...parts: Uint8Array[]): Uint8Array => {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
};

const messageKey = (shared: Uint8Array, epk: Uint8Array, publicKey: Uint8Array, aad: Uint8Array): Uint8Array =>
  hkdf(sha256, shared, concat(epk, publicKey), concat(INFO, aad), 32);

export const scalarFrom = (bytes: Uint8Array): bigint => (toBigint(bytes) % (ORDER - 1n)) + 1n;

export function sealWith(plaintext: Uint8Array, recipientPublicKey: Uint8Array, aad: Uint8Array, ephemeralSecret: bigint): Uint8Array {
  const epk = Point.BASE.multiply(ephemeralSecret).toBytes();
  const shared = Point.fromBytes(recipientPublicKey).multiply(ephemeralSecret).toBytes();
  const sealed = chacha20poly1305(messageKey(shared, epk, recipientPublicKey, aad), NONCE).encrypt(plaintext);
  return concat(Uint8Array.of(VERSION), epk, sealed);
}

/** `version | epk | ciphertext+tag`, readable only by the holder of the recipient key and only under the same associated data. */
export const seal = (plaintext: Uint8Array, recipientPublicKey: Uint8Array, aad: Uint8Array): Uint8Array =>
  sealWith(plaintext, recipientPublicKey, aad, randomScalar());

export function open(sealed: Uint8Array, secret: bigint, publicKey: Uint8Array, aad: Uint8Array): Uint8Array | undefined {
  if (sealed.length < 1 + 32 + 16 || sealed[0] !== VERSION) return undefined;
  try {
    const epk = sealed.slice(1, 33);
    const shared = Point.fromBytes(epk).multiply(secret).toBytes();
    return chacha20poly1305(messageKey(shared, epk, publicKey, aad), NONCE).decrypt(sealed.slice(33));
  } catch {
    return undefined;
  }
}
