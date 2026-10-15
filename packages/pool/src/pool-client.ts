import { type Address, type Hex, encodeAbiParameters, keccak256 } from "viem";
import { FIELD_MODULUS } from "./field.ts";

export const shieldLabel = (depositor: Address, nonce: bigint): bigint =>
  (BigInt(keccak256(encodeAbiParameters([{ type: "address" }, { type: "uint256" }], [depositor, nonce]))) % (FIELD_MODULUS - 1n)) + 1n;

export const ciphertextHash = (ciphertext: Hex): bigint => BigInt(keccak256(ciphertext)) % FIELD_MODULUS;

export const addressToField = (address: Address): bigint => BigInt(address);
