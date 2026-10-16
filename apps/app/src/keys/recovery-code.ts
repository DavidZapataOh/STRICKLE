import { ristretto255 } from "@noble/curves/ed25519.js";
import { sha256 } from "@noble/hashes/sha2.js";

const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const SECRET_BYTES = 32;
const CHECK_BYTES = 2;
const CHARS = Math.ceil(((SECRET_BYTES + CHECK_BYTES) * 8) / 5);
const GROUP = 5;

const utf8 = (value: string) => new TextEncoder().encode(value);
const toBytes = (secret: bigint): Uint8Array => Uint8Array.from({ length: SECRET_BYTES }, (_, i) => Number((secret >> BigInt(8 * (SECRET_BYTES - 1 - i))) & 0xffn));
const toBigint = (bytes: Uint8Array): bigint => bytes.reduce((acc, byte) => (acc << 8n) | BigInt(byte), 0n);
const checksum = (secret: Uint8Array): Uint8Array => sha256(Uint8Array.from([...utf8("strickle/notice-key/recovery/v1"), ...secret])).slice(0, CHECK_BYTES);

/** The public half of a notice key, or undefined when the secret is not a valid ristretto255 scalar. */
export function noticePublicKey(secret: bigint): Uint8Array | undefined {
  try {
    return ristretto255.Point.BASE.multiply(secret).toBytes();
  } catch {
    return undefined;
  }
}

/** Crockford base32 of the secret and a two-byte checksum, in groups of five: eleven groups a person can copy by hand and check. */
export function encodeRecoveryCode(secret: bigint): string {
  const bytes = toBytes(secret);
  const payload = Uint8Array.from([...bytes, ...checksum(bytes)]);
  let bits = 0n;
  for (const byte of payload) bits = (bits << 8n) | BigInt(byte);
  const padded = bits << BigInt(CHARS * 5 - payload.length * 8);
  let text = "";
  for (let index = CHARS - 1; index >= 0; index--) text += ALPHABET[Number((padded >> BigInt(index * 5)) & 31n)];
  return text.match(new RegExp(`.{1,${GROUP}}`, "g"))!.join("-");
}

/** Accepts upper or lower case, spaces and dashes, and the Crockford look-alikes (I and L for 1, O for 0). Undefined for anything else. */
export function decodeRecoveryCode(code: string): bigint | undefined {
  const clean = code.toUpperCase().replace(/[\s-]/g, "").replace(/[IL]/g, "1").replace(/O/g, "0");
  if (clean.length !== CHARS || [...clean].some((char) => !ALPHABET.includes(char))) return undefined;
  let bits = 0n;
  for (const char of clean) bits = (bits << 5n) | BigInt(ALPHABET.indexOf(char));
  const extra = BigInt(CHARS * 5 - (SECRET_BYTES + CHECK_BYTES) * 8);
  if (bits & ((1n << extra) - 1n)) return undefined;
  const payload = bits >> extra;
  const secretBytes = Uint8Array.from({ length: SECRET_BYTES }, (_, i) => Number((payload >> BigInt(8 * (SECRET_BYTES + CHECK_BYTES - 1 - i))) & 0xffn));
  const given = Uint8Array.from({ length: CHECK_BYTES }, (_, i) => Number((payload >> BigInt(8 * (CHECK_BYTES - 1 - i))) & 0xffn));
  const expected = checksum(secretBytes);
  if (given.some((byte, i) => byte !== expected[i])) return undefined;
  const secret = toBigint(secretBytes);
  return noticePublicKey(secret) ? secret : undefined;
}

/** Which two groups the user is asked to type back before the account is created (zero-based, fixed so a test can pin them). */
export const CONFIRM_GROUPS = [2, 7] as const;

export function groupsOf(code: string): string[] {
  return code.split("-");
}

export function confirmsRecovery(code: string, typed: readonly [string, string]): boolean {
  const groups = groupsOf(code);
  return CONFIRM_GROUPS.every((index, position) => (typed[position] ?? "").toUpperCase().replace(/[\s-]/g, "").replace(/[IL]/g, "1").replace(/O/g, "0") === groups[index]);
}
