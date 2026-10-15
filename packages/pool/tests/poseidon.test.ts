import { describe, expect, it } from "vitest";
import { FIELD_MODULUS } from "../src/field.ts";
import { hash } from "../src/poseidon.ts";

describe("poseidon2 hash", () => {
  it("matches the Noir and Solidity anchor vector", () => {
    expect(hash([1n, 2n])).toBe(0x038682aa1cb5ae4e0a3f13da432a95c77c5c111f6f030faf9cad641ce1ed7383n);
  });

  it("depends on the number of inputs, not only their values", () => {
    expect(hash([1n, 0n])).not.toBe(hash([1n]));
  });

  it("rejects values that are not field elements instead of silently reducing them", () => {
    expect(() => hash([FIELD_MODULUS])).toThrow(/input 0 is not a BN254 field element/);
    expect(() => hash([1n, -1n])).toThrow(RangeError);
  });

  it("is deterministic", () => {
    expect(hash([7n, 8n, 9n])).toBe(hash([7n, 8n, 9n]));
  });
});
