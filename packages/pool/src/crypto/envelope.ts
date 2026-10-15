import { chacha20poly1305 } from "@noble/ciphers/chacha.js";
import { hkdf } from "@noble/hashes/hkdf.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { randomBytes } from "@noble/hashes/utils.js";
import { type Hex, bytesToHex, hexToBytes } from "viem";
import type { Note } from "../note.ts";
import type { Policy } from "../policy.ts";
import { Point, keyId, scalarFromBytes } from "./keys.ts";
import { encodeAccountantPayload, encodeAuthorityPayload, encodeOwnerPayload } from "./wire.ts";

export type Tier = "owner" | "accountant" | "authority";

const VERSION = 1;
const TIER_CODE: Record<Tier, number> = { owner: 1, accountant: 2, authority: 3 };
const WRAP_INFO = new TextEncoder().encode("strickle/wrap/v1");
const HEADER = 1 + 32 + 1;
const WRAP = 48;
const ZERO_NONCE = new Uint8Array(12);

export interface Viewer {
  tier: Tier;
  publicKey: Uint8Array;
}

export interface OutputPlaintext {
  note: Note;
  policy: Policy;
  viewers: Viewer[];
}

/** Either the viewer's secret scalar, or a shared secret already combined from threshold partials. */
export type Opener = { publicKey: Uint8Array; secret: bigint; sharedSecret?: undefined } | { publicKey: Uint8Array; sharedSecret: Uint8Array; secret?: undefined };

const concat = (...parts: Uint8Array[]): Uint8Array => {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
};

const wrapNonce = (outputIndex: number): Uint8Array => {
  const nonce = new Uint8Array(12);
  nonce[11] = outputIndex;
  return nonce;
};

const wrapKey = (shared: Uint8Array, epk: Uint8Array, viewerPublicKey: Uint8Array, tierCode: number): Uint8Array =>
  hkdf(sha256, shared, concat(epk, viewerPublicKey), concat(WRAP_INFO, Uint8Array.of(tierCode)), 32);

function payloadFor(tier: Tier, output: OutputPlaintext): Uint8Array {
  if (tier === "owner") return encodeOwnerPayload(output);
  if (tier === "accountant") return encodeAccountantPayload(output.note);
  return encodeAuthorityPayload(output.note);
}

function section(output: OutputPlaintext, viewer: Viewer, esk: bigint, epk: Uint8Array, outputIndex: number): Uint8Array {
  const contentKey = randomBytes(32);
  const shared = Point.fromBytes(viewer.publicKey).multiply(esk).toBytes();
  const wrapped = chacha20poly1305(wrapKey(shared, epk, viewer.publicKey, TIER_CODE[viewer.tier]), wrapNonce(outputIndex)).encrypt(contentKey);
  const plaintext = payloadFor(viewer.tier, output);
  const sealed = chacha20poly1305(contentKey, ZERO_NONCE).encrypt(plaintext);
  return concat(Uint8Array.of(TIER_CODE[viewer.tier]), keyId(viewer.publicKey), wrapped, Uint8Array.of(plaintext.length >> 8, plaintext.length & 0xff), sealed);
}

export function sealEnvelope(outputs: [OutputPlaintext | null, OutputPlaintext | null]): Hex {
  const esk = scalarFromBytes(randomBytes(64));
  const epk = Point.BASE.multiply(esk).toBytes();
  const parts: Uint8Array[] = [Uint8Array.of(VERSION), epk, Uint8Array.of(2)];
  outputs.forEach((output, index) => {
    if (!output) {
      parts.push(Uint8Array.of(0));
      return;
    }
    parts.push(Uint8Array.of(output.viewers.length), ...output.viewers.map((viewer) => section(output, viewer, esk, epk, index)));
  });
  return bytesToHex(concat(...parts));
}

export function envelopeEpk(envelope: Hex): Uint8Array {
  return hexToBytes(envelope).slice(1, 33);
}

interface ParsedSection {
  tier: number;
  keyId: Uint8Array;
  wrap: Uint8Array;
  payload: Uint8Array;
}

function parse(bytes: Uint8Array): { epk: Uint8Array; outputs: ParsedSection[][] } | undefined {
  if (bytes.length < HEADER || bytes[0] !== VERSION || bytes[HEADER - 1] !== 2) return undefined;
  const epk = bytes.slice(1, 33);
  let at = HEADER;
  const outputs: ParsedSection[][] = [];
  for (let output = 0; output < 2; output++) {
    const count = bytes[at++];
    if (count === undefined) return undefined;
    const sections: ParsedSection[] = [];
    for (let i = 0; i < count; i++) {
      if (at + 1 + 4 + WRAP + 2 > bytes.length) return undefined;
      const tier = bytes[at] as number;
      const id = bytes.slice(at + 1, at + 5);
      const wrap = bytes.slice(at + 5, at + 5 + WRAP);
      const length = ((bytes[at + 5 + WRAP] as number) << 8) | (bytes[at + 6 + WRAP] as number);
      const start = at + 7 + WRAP;
      if (start + length + 16 > bytes.length) return undefined;
      sections.push({ tier, keyId: id, wrap, payload: bytes.slice(start, start + length + 16) });
      at = start + length + 16;
    }
    outputs.push(sections);
  }
  return at === bytes.length ? { epk, outputs } : undefined;
}

const sameBytes = (a: Uint8Array, b: Uint8Array): boolean => a.length === b.length && a.every((value, i) => value === b[i]);

export function openSection(envelope: Hex, outputIndex: 0 | 1, tier: Tier, opener: Opener): Uint8Array | undefined {
  let bytes: Uint8Array;
  try {
    bytes = hexToBytes(envelope);
  } catch {
    return undefined;
  }
  const parsed = parse(bytes);
  if (!parsed) return undefined;
  const id = keyId(opener.publicKey);
  for (const candidate of parsed.outputs[outputIndex] ?? []) {
    if (candidate.tier !== TIER_CODE[tier] || !sameBytes(candidate.keyId, id)) continue;
    try {
      const shared = opener.sharedSecret ?? Point.fromBytes(parsed.epk).multiply(opener.secret as bigint).toBytes();
      const contentKey = chacha20poly1305(wrapKey(shared, parsed.epk, opener.publicKey, TIER_CODE[tier]), wrapNonce(outputIndex)).decrypt(candidate.wrap);
      return chacha20poly1305(contentKey, ZERO_NONCE).decrypt(candidate.payload);
    } catch {
      continue;
    }
  }
  return undefined;
}
