import { open, seal, sealWith } from "./sealed.js";
/** The message is always exactly the code, so nothing about a request can leak through an error. */
export class ProtocolError extends Error {
    code;
    constructor(code) {
        super(code);
        this.code = code;
    }
}
export const MAX_AGE_SECONDS = 60;
export const MAX_FUTURE_SECONDS = 5;
const NAME = /^[a-z][a-z0-9_]{0,31}$/;
const ID = /^[0-9a-f]{64}$/;
const BASE64 = /^[A-Za-z0-9+/]*={0,2}$/;
export const aadFor = (circuit) => new TextEncoder().encode(`strickle-prover/v1:${circuit}`);
const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
// Written out because the confidential runtime has no btoa.
export function toBase64(bytes) {
    let text = "";
    for (let i = 0; i < bytes.length; i += 3) {
        const chunk = (bytes[i] << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0);
        text += ALPHABET.charAt((chunk >> 18) & 63) + ALPHABET.charAt((chunk >> 12) & 63);
        text += i + 1 < bytes.length ? ALPHABET.charAt((chunk >> 6) & 63) : "=";
        text += i + 2 < bytes.length ? ALPHABET.charAt(chunk & 63) : "=";
    }
    return text;
}
function fromBase64(text) {
    if (text.length % 4 !== 0 || !BASE64.test(text))
        throw new ProtocolError("malformed");
    return Uint8Array.from(atob(text), (char) => char.charCodeAt(0));
}
export function encodeRequest(request, serverPublicKey) {
    const plaintext = new TextEncoder().encode(JSON.stringify(request));
    return { circuit: request.circuit, sealed: toBase64(seal(plaintext, serverPublicKey, aadFor(request.circuit))) };
}
export function encodeRequestWith(request, serverPublicKey, ephemeralSecret) {
    const plaintext = new TextEncoder().encode(JSON.stringify(request));
    return { circuit: request.circuit, sealed: toBase64(sealWith(plaintext, serverPublicKey, aadFor(request.circuit), ephemeralSecret)) };
}
/** Remembers request ids for a while so an intercepted request cannot be played again. */
export class ReplayCache {
    #ttl;
    #seen = new Map();
    constructor(ttlSeconds) {
        this.#ttl = ttlSeconds;
    }
    /** Returns true if the id was already present; otherwise records it and returns false. */
    seen(id, now) {
        for (const [known, expires] of this.#seen) {
            if (expires > now)
                break;
            this.#seen.delete(known);
        }
        if (this.#seen.has(id))
            return true;
        this.#seen.set(id, now + this.#ttl);
        return false;
    }
}
export function decodeRequest(body, key, now, replay) {
    if (typeof body !== "object" || body === null)
        throw new ProtocolError("malformed");
    const { circuit, sealed } = body;
    if (typeof circuit !== "string" || !NAME.test(circuit) || typeof sealed !== "string")
        throw new ProtocolError("malformed");
    const plaintext = open(fromBase64(sealed), key.secret, key.publicKey, aadFor(circuit));
    if (!plaintext)
        throw new ProtocolError("malformed");
    let parsed;
    try {
        parsed = JSON.parse(new TextDecoder().decode(plaintext));
    }
    catch {
        throw new ProtocolError("malformed");
    }
    const { requestId, issuedAt, circuit: inner, inputs } = parsed;
    if (typeof requestId !== "string" || !ID.test(requestId) || !Number.isInteger(issuedAt) || typeof inner !== "string" || inputs === undefined) {
        throw new ProtocolError("malformed");
    }
    if (inner !== circuit)
        throw new ProtocolError("wrong-circuit");
    const age = now - issuedAt;
    if (age > MAX_AGE_SECONDS || age < -MAX_FUTURE_SECONDS)
        throw new ProtocolError("stale");
    if (replay.seen(requestId, now))
        throw new ProtocolError("replayed");
    return { requestId, issuedAt: issuedAt, circuit, inputs };
}
