import { open, seal, sealWith, type ProverKey } from "./sealed.ts";

export type ProtocolCode = "malformed" | "stale" | "replayed" | "wrong-circuit";

/** The message is always exactly the code, so nothing about a request can leak through an error. */
export class ProtocolError extends Error {
  readonly code: ProtocolCode;
  constructor(code: ProtocolCode) {
    super(code);
    this.code = code;
  }
}

export interface ProveRequest {
  requestId: string;
  issuedAt: number;
  circuit: string;
  inputs: unknown;
}

export interface ProveBody {
  circuit: string;
  sealed: string;
}

export const MAX_AGE_SECONDS = 60;
export const MAX_FUTURE_SECONDS = 5;
const NAME = /^[a-z][a-z0-9_]{0,31}$/;
const ID = /^[0-9a-f]{64}$/;
const BASE64 = /^[A-Za-z0-9+/]*={0,2}$/;

export const aadFor = (circuit: string): Uint8Array => new TextEncoder().encode(`strickle-prover/v1:${circuit}`);

function toBase64(bytes: Uint8Array): string {
  let text = "";
  for (let i = 0; i < bytes.length; i += 0x8000) text += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(text);
}

function fromBase64(text: string): Uint8Array {
  if (text.length % 4 !== 0 || !BASE64.test(text)) throw new ProtocolError("malformed");
  return Uint8Array.from(atob(text), (char) => char.charCodeAt(0));
}

export function encodeRequest(request: ProveRequest, serverPublicKey: Uint8Array): ProveBody {
  const plaintext = new TextEncoder().encode(JSON.stringify(request));
  return { circuit: request.circuit, sealed: toBase64(seal(plaintext, serverPublicKey, aadFor(request.circuit))) };
}

export function encodeRequestWith(request: ProveRequest, serverPublicKey: Uint8Array, ephemeralSecret: bigint): ProveBody {
  const plaintext = new TextEncoder().encode(JSON.stringify(request));
  return { circuit: request.circuit, sealed: toBase64(sealWith(plaintext, serverPublicKey, aadFor(request.circuit), ephemeralSecret)) };
}

/** Remembers request ids for a while so an intercepted request cannot be played again. */
export class ReplayCache {
  readonly #ttl: number;
  readonly #seen = new Map<string, number>();

  constructor(ttlSeconds: number) {
    this.#ttl = ttlSeconds;
  }

  /** Returns true if the id was already present; otherwise records it and returns false. */
  seen(id: string, now: number): boolean {
    for (const [known, expires] of this.#seen) {
      if (expires > now) break;
      this.#seen.delete(known);
    }
    if (this.#seen.has(id)) return true;
    this.#seen.set(id, now + this.#ttl);
    return false;
  }
}

export function decodeRequest(body: unknown, key: ProverKey, now: number, replay: ReplayCache): ProveRequest {
  if (typeof body !== "object" || body === null) throw new ProtocolError("malformed");
  const { circuit, sealed } = body as Record<string, unknown>;
  if (typeof circuit !== "string" || !NAME.test(circuit) || typeof sealed !== "string") throw new ProtocolError("malformed");
  const plaintext = open(fromBase64(sealed), key.secret, key.publicKey, aadFor(circuit));
  if (!plaintext) throw new ProtocolError("malformed");
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(new TextDecoder().decode(plaintext));
  } catch {
    throw new ProtocolError("malformed");
  }
  const { requestId, issuedAt, circuit: inner, inputs } = parsed;
  if (typeof requestId !== "string" || !ID.test(requestId) || !Number.isInteger(issuedAt) || typeof inner !== "string" || inputs === undefined) {
    throw new ProtocolError("malformed");
  }
  if (inner !== circuit) throw new ProtocolError("wrong-circuit");
  const age = now - (issuedAt as number);
  if (age > MAX_AGE_SECONDS || age < -MAX_FUTURE_SECONDS) throw new ProtocolError("stale");
  if (replay.seen(requestId, now)) throw new ProtocolError("replayed");
  return { requestId, issuedAt: issuedAt as number, circuit, inputs };
}
