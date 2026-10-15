import { describe, expect, it } from "vitest";
import { FIELD_MODULUS, assertField, assertUint, toHex32 } from "../src/field.ts";

describe("field", () => {
  it("is the BN254 scalar field", () => {
    expect(FIELD_MODULUS).toBe(21888242871839275222246405745257275088548364400416034343698204186575808495617n);
  });

  it("accepts 0 and r-1 and rejects r, negatives", () => {
    expect(() => assertField(0n, "x")).not.toThrow();
    expect(() => assertField(FIELD_MODULUS - 1n, "x")).not.toThrow();
    expect(() => assertField(FIELD_MODULUS, "x")).toThrow(/x is not a BN254 field element/);
    expect(() => assertField(-1n, "x")).toThrow(RangeError);
  });

  it("checks unsigned integer widths exactly", () => {
    expect(() => assertUint(2n ** 64n - 1n, 64, "n")).not.toThrow();
    expect(() => assertUint(2n ** 64n, 64, "n")).toThrow(/n does not fit in 64 bits/);
    expect(() => assertUint(-1n, 8, "n")).toThrow(RangeError);
  });

  it("formats 32-byte hex", () => {
    expect(toHex32(255n)).toBe("0x" + "0".repeat(62) + "ff");
  });
});
