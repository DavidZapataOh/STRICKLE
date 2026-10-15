import type { Hex } from "viem";
import { type Note, noteCommitment } from "../note.ts";
import { type Policy, policyHash } from "../policy.ts";
import { openSection } from "./envelope.ts";
import type { ViewKey } from "./keys.ts";
import { decodeOwnerPayload } from "./wire.ts";

/**
 * Opens the owner section of an output and accepts it only if it really opens the on-chain commitment:
 * a sender can attach any ciphertext to a valid proof, so the plaintext is never trusted on its own.
 */
export function openOwnerNote(envelope: Hex, outputIndex: 0 | 1, ownerKey: ViewKey, commitment: bigint): { note: Note; policy: Policy } | undefined {
  const bytes = openSection(envelope, outputIndex, "owner", ownerKey);
  if (!bytes) return undefined;
  try {
    const opened = decodeOwnerPayload(bytes);
    return noteCommitment(opened.note) === commitment && policyHash(opened.policy) === opened.note.policy ? opened : undefined;
  } catch {
    return undefined;
  }
}
