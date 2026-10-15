// workflows/agent/enclave/keys.ts
import { xchacha20poly1305 } from "@noble/ciphers/chacha.js";
import { ristretto255 } from "@noble/curves/ed25519.js";
import { hkdf } from "@noble/hashes/hkdf.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { type Address, hexToBytes, numberToBytes } from "viem";

const Point = ristretto255.Point;
const ORDER = Point.Fn.ORDER;
const utf8 = (value: string) => new TextEncoder().encode(value);
const concat = (...parts: Uint8Array[]) => {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
};
const toBigint = (bytes: Uint8Array) => bytes.reduce((acc, byte) => (acc << 8n) | BigInt(byte), 0n);

export function parseMaster(value: string): Uint8Array {
  if (!/^0x[0-9a-fA-F]{64}$/.test(value)) throw new Error("AGENT_MASTER is not 32 hex bytes");
  return hexToBytes(value as `0x${string}`);
}

export function deriveSealKey(master: Uint8Array): { secret: bigint; publicKey: Uint8Array } {
  const material = hkdf(sha256, master, undefined, utf8("strickle/enclave-seal/v1"), 64);
  const secret = (toBigint(material) % (ORDER - 1n)) + 1n;
  return { secret, publicKey: Point.BASE.multiply(secret).toBytes() };
}

export const profileAad = (vault: Address): Uint8Array => concat(utf8("strickle/profile/v1"), hexToBytes(vault));

export const stateKey = (master: Uint8Array, vault: Address): Uint8Array =>
  hkdf(sha256, master, hexToBytes(vault), utf8("strickle/state-key/v1"), 32);

const version8 = (version: bigint) => numberToBytes(version, { size: 8 });

const aad = (vault: Address, version: bigint) => concat(utf8("strickle/state/v1"), hexToBytes(vault), version8(version));

export function encryptState(master: Uint8Array, vault: Address, version: bigint, plaintext: Uint8Array): Uint8Array {
  const key = stateKey(master, vault);
  const nonce = hkdf(sha256, key, concat(version8(version), sha256(plaintext)), utf8("strickle/state-nonce/v2"), 24);
  return concat(nonce, xchacha20poly1305(key, nonce, aad(vault, version)).encrypt(plaintext));
}

export function decryptState(master: Uint8Array, vault: Address, version: bigint, stored: Uint8Array): Uint8Array {
  try {
    if (stored.length < 24 + 16) throw new Error();
    return xchacha20poly1305(stateKey(master, vault), stored.slice(0, 24), aad(vault, version)).decrypt(stored.slice(24));
  } catch {
    throw new Error("state did not decrypt");
  }
}
