import { describe, expect, it } from "vitest";
import { ORDER, deriveOwnerViewKey, generateViewKey, keyId, viewKeyFromSecret } from "../../src/crypto/keys.ts";

describe("view keys", () => {
  it("derives the owner view key deterministically from the spend secret", () => {
    const a = deriveOwnerViewKey(5n);
    const b = deriveOwnerViewKey(5n);
    expect(a.secret).toBe(b.secret);
    expect(a.publicKey).toEqual(b.publicKey);
    expect(deriveOwnerViewKey(6n).secret).not.toBe(a.secret);
  });

  it("never yields a zero or out-of-range scalar", () => {
    for (let i = 0; i < 40; i++) {
      const { secret } = generateViewKey();
      expect(secret > 0n && secret < ORDER).toBe(true);
    }
    expect(deriveOwnerViewKey(0n).secret > 0n).toBe(true);
  });

  it("publishes a 32-byte public key that matches the secret", () => {
    const key = generateViewKey();
    expect(key.publicKey).toHaveLength(32);
    expect(viewKeyFromSecret(key.secret).publicKey).toEqual(key.publicKey);
  });

  it("identifies a key by four bytes of its hash and tells keys apart", () => {
    const a = generateViewKey();
    const b = generateViewKey();
    expect(keyId(a.publicKey)).toHaveLength(4);
    expect(keyId(a.publicKey)).not.toEqual(keyId(b.publicKey));
  });
});
