import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const VERSION = 1;
const NONCE_BYTES = 12;
const TAG_BYTES = 16;

export function parseKey(base64: string): Buffer {
  const key = Buffer.from(base64, "base64");
  if (key.length !== 32) throw new Error("the encryption key must be 32 bytes encoded as base64");
  return key;
}

export function seal(key: Buffer, plaintext: Uint8Array, context: string): Buffer {
  const nonce = randomBytes(NONCE_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key, nonce);
  cipher.setAAD(Buffer.from(context));
  const body = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return Buffer.concat([Buffer.of(VERSION), nonce, body, cipher.getAuthTag()]);
}

export function open(key: Buffer, sealed: Uint8Array, context: string): Buffer {
  const blob = Buffer.from(sealed);
  if (blob.length < 1 + NONCE_BYTES + TAG_BYTES) throw new Error("sealed value is too short");
  if (blob[0] !== VERSION) throw new Error(`unsupported seal version ${blob[0]}`);
  const nonce = blob.subarray(1, 1 + NONCE_BYTES);
  const body = blob.subarray(1 + NONCE_BYTES, blob.length - TAG_BYTES);
  const decipher = createDecipheriv("aes-256-gcm", key, nonce);
  decipher.setAAD(Buffer.from(context));
  decipher.setAuthTag(blob.subarray(blob.length - TAG_BYTES));
  return Buffer.concat([decipher.update(body), decipher.final()]);
}
