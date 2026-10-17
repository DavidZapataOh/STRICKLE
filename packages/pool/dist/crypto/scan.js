import { noteCommitment } from "../note.js";
import { policyHash } from "../policy.js";
import { openSection } from "./envelope.js";
import { decodeOwnerPayload } from "./wire.js";
/**
 * Opens the owner section of an output and accepts it only if it really opens the on-chain commitment:
 * a sender can attach any ciphertext to a valid proof, so the plaintext is never trusted on its own.
 */
export function openOwnerNote(envelope, outputIndex, ownerKey, commitment) {
    const bytes = openSection(envelope, outputIndex, "owner", ownerKey);
    if (!bytes)
        return undefined;
    try {
        const opened = decodeOwnerPayload(bytes);
        return noteCommitment(opened.note) === commitment && policyHash(opened.policy) === opened.note.policy ? opened : undefined;
    }
    catch {
        return undefined;
    }
}
