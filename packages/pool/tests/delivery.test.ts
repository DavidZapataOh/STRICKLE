import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { DOMAIN } from "../src/constants.ts";
import { deliveryKey, deliveryPad, deliverySalt, decryptDelivery, encryptDelivery, packDelivery, unpackDelivery } from "../src/delivery.ts";
import { FIELD_MODULUS } from "../src/field.ts";
import { hash } from "../src/poseidon.ts";

const field = fc.bigInt({ min: 0n, max: FIELD_MODULUS - 1n });

describe("delivery", () => {
  it("derives the key, salt and pad under their own tags", () => {
    const key = deliveryKey(5n, 6n, 1);
    expect(key).toBe(hash([DOMAIN.DELIVERY_KEY, 5n, 6n, 1n]));
    expect(deliverySalt(key)).toBe(hash([DOMAIN.DELIVERY_SALT, key]));
    expect(deliveryPad(key)).toBe(hash([DOMAIN.DELIVERY_PAD, key]));
    expect(new Set([key, deliverySalt(key), deliveryPad(key)]).size).toBe(3);
  });

  it("gives every output of every transaction its own key", () => {
    expect(deliveryKey(5n, 6n, 0)).not.toBe(deliveryKey(5n, 6n, 1));
    expect(deliveryKey(5n, 6n, 0)).not.toBe(deliveryKey(5n, 7n, 0));
    expect(deliveryKey(5n, 6n, 0)).not.toBe(deliveryKey(4n, 6n, 0));
  });

  it("packs amount, flags and lock into one value below 2^136 and unpacks it", () => {
    fc.assert(
      fc.property(fc.bigInt({ min: 0n, max: 2n ** 64n - 1n }), fc.integer({ min: 0, max: 1 }), fc.bigInt({ min: 0n, max: 2n ** 64n - 1n }), (amount, flags, lockUntil) => {
        const m = packDelivery({ amount, flags, lockUntil });
        expect(m < 2n ** 136n).toBe(true);
        expect(unpackDelivery(m)).toEqual({ amount, flags, lockUntil });
      }),
      { numRuns: 100 },
    );
    expect(() => packDelivery({ amount: 2n ** 64n, flags: 0, lockUntil: 0n })).toThrow(RangeError);
    expect(() => packDelivery({ amount: 1n, flags: 2, lockUntil: 0n })).toThrow(RangeError);
  });

  it("rejects a decrypted value that is not a packed delivery", () => {
    expect(unpackDelivery(2n ** 136n)).toBeUndefined();
    expect(unpackDelivery(FIELD_MODULUS - 1n)).toBeUndefined();
  });

  it("encrypts and decrypts with the pad, and a wrong key reveals nothing usable", () => {
    fc.assert(
      fc.property(field, field, (rawKey, other) => {
        const m = packDelivery({ amount: 123n, flags: 1, lockUntil: 456n });
        const enc = encryptDelivery(m, rawKey);
        expect(decryptDelivery(enc, rawKey)).toBe(m);
        if (other !== rawKey) expect(unpackDelivery(decryptDelivery(enc, other))).toBeUndefined();
      }),
      { numRuns: 50 },
    );
  });
});
