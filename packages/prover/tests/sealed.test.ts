import { describe, expect, it } from "vitest";
import { generateProverKey, open, scalarFrom, seal, sealWith } from "../src/sealed.ts";

const aad = new TextEncoder().encode("strickle-prover/v1:spend");
const message = new TextEncoder().encode(JSON.stringify({ secret: "do not leak" }));

describe("sealed box", () => {
  it("opens with the recipient's key and the same associated data", () => {
    const key = generateProverKey();
    const sealed = seal(message, key.publicKey, aad);
    expect(open(sealed, key.secret, key.publicKey, aad)).toEqual(message);
  });

  it("produces a different ciphertext every time", () => {
    const key = generateProverKey();
    expect(seal(message, key.publicKey, aad)).not.toEqual(seal(message, key.publicKey, aad));
  });

  it("does not reveal the plaintext in the sealed bytes", () => {
    const key = generateProverKey();
    const text = new TextDecoder("latin1").decode(seal(message, key.publicKey, aad));
    expect(text).not.toContain("do not leak");
  });

  it("refuses another key, other associated data, any flipped byte, truncation and a bad version", () => {
    const key = generateProverKey();
    const other = generateProverKey();
    const sealed = seal(message, key.publicKey, aad);
    expect(open(sealed, other.secret, other.publicKey, aad)).toBeUndefined();
    expect(open(sealed, key.secret, key.publicKey, new TextEncoder().encode("strickle-prover/v1:shield"))).toBeUndefined();
    for (let position = 0; position < sealed.length; position += 5) {
      const tampered = new Uint8Array(sealed);
      tampered[position] = (tampered[position] as number) ^ 1;
      expect(open(tampered, key.secret, key.publicKey, aad)).toBeUndefined();
    }
    expect(open(sealed.slice(0, sealed.length - 1), key.secret, key.publicKey, aad)).toBeUndefined();
    expect(open(new Uint8Array(10), key.secret, key.publicKey, aad)).toBeUndefined();
    const wrongVersion = new Uint8Array(sealed);
    wrongVersion[0] = 2;
    expect(open(wrongVersion, key.secret, key.publicKey, aad)).toBeUndefined();
  });

  it("generates distinct 32-byte public keys", () => {
    const a = generateProverKey();
    const b = generateProverKey();
    expect(a.publicKey).toHaveLength(32);
    expect(a.publicKey).not.toEqual(b.publicKey);
  });
});

describe("sealWith", () => {
  const aad = new TextEncoder().encode("aad");
  const message = new TextEncoder().encode("hello");

  it("is deterministic for a fixed ephemeral secret and opens like any sealed box", () => {
    const key = generateProverKey();
    const secret = scalarFrom(Uint8Array.from({ length: 64 }, (_, i) => i + 1));
    const a = sealWith(message, key.publicKey, aad, secret);
    expect(sealWith(message, key.publicKey, aad, secret)).toEqual(a);
    expect(open(a, key.secret, key.publicKey, aad)).toEqual(message);
  });

  it("differs for a different ephemeral secret", () => {
    const key = generateProverKey();
    const a = sealWith(message, key.publicKey, aad, scalarFrom(new Uint8Array(64).fill(1)));
    const b = sealWith(message, key.publicKey, aad, scalarFrom(new Uint8Array(64).fill(2)));
    expect(a).not.toEqual(b);
  });

  it("keeps seal random", () => {
    const key = generateProverKey();
    expect(seal(message, key.publicKey, aad)).not.toEqual(seal(message, key.publicKey, aad));
  });

  it("maps any bytes to a usable scalar, including all zeros", () => {
    expect(scalarFrom(new Uint8Array(64)) > 0n).toBe(true);
    expect(scalarFrom(new Uint8Array(64).fill(255)) > 0n).toBe(true);
  });
});
