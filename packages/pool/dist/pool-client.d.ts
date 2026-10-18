import { type Address, type Hex } from "viem";
export declare const shieldLabel: (depositor: Address, nonce: bigint) => bigint;
export declare const ciphertextHash: (ciphertext: Hex) => bigint;
export declare const addressToField: (address: Address) => bigint;
