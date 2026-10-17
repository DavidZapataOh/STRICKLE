import type { Hex } from "viem";
import { type Note } from "../note.ts";
import { type Policy } from "../policy.ts";
import type { ViewKey } from "./keys.ts";
/**
 * Opens the owner section of an output and accepts it only if it really opens the on-chain commitment:
 * a sender can attach any ciphertext to a valid proof, so the plaintext is never trusted on its own.
 */
export declare function openOwnerNote(envelope: Hex, outputIndex: 0 | 1, ownerKey: ViewKey, commitment: bigint): {
    note: Note;
    policy: Policy;
} | undefined;
