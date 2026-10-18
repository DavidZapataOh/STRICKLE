import { encodeAbiParameters, keccak256 } from "viem";
import { FIELD_MODULUS } from "./field.js";
export const shieldLabel = (depositor, nonce) => (BigInt(keccak256(encodeAbiParameters([{ type: "address" }, { type: "uint256" }], [depositor, nonce]))) % (FIELD_MODULUS - 1n)) + 1n;
export const ciphertextHash = (ciphertext) => BigInt(keccak256(ciphertext)) % FIELD_MODULUS;
export const addressToField = (address) => BigInt(address);
