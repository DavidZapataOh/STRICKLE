import { encodeAbiParameters, keccak256, toBytes } from "viem";
import { describe, expect, it } from "vitest";
import { FIELD_MODULUS } from "../src/field.ts";
import { addressToField, ciphertextHash, shieldLabel } from "../src/pool-client.ts";

const alice = "0x5Bb738955aa5E5cAc67BF7C074c23dce7A8b1BB4" as const;

describe("pool client helpers", () => {
  it("derives the label from the depositor and its nonce, never zero and below the modulus", () => {
    const raw = BigInt(keccak256(encodeAbiParameters([{ type: "address" }, { type: "uint256" }], [alice, 7n])));
    expect(shieldLabel(alice, 7n)).toBe((raw % (FIELD_MODULUS - 1n)) + 1n);
    expect(shieldLabel(alice, 7n)).not.toBe(shieldLabel(alice, 8n));
    expect(shieldLabel(alice, 0n)).toBeGreaterThan(0n);
    expect(shieldLabel(alice, 0n)).toBeLessThan(FIELD_MODULUS);
  });

  it("hashes ciphertexts with keccak256 reduced into the field", () => {
    const bytes = "0x0102030405";
    expect(ciphertextHash(bytes)).toBe(BigInt(keccak256(toBytes(bytes))) % FIELD_MODULUS);
  });

  it("maps an address to a field element", () => {
    expect(addressToField(alice)).toBe(BigInt(alice));
  });
});
