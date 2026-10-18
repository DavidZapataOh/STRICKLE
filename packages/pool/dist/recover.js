import { decryptDelivery, deliveryKey, deliverySalt, unpackDelivery } from "./delivery.js";
import { noteCommitment } from "./note.js";
import { policyHash } from "./policy.js";
/** Rebuilds the outputs a spend kept for its owner from public data and `nk`, with no ciphertext. */
export function recoverSelfNotes(args) {
    const { nk, ownerPk, transaction, candidates } = args;
    const recovered = [];
    for (const j of [0, 1]) {
        const enc = transaction.enc[j];
        if (enc === 0n)
            continue;
        const key = deliveryKey(nk, transaction.nullifier0, j);
        const delivery = unpackDelivery(decryptDelivery(enc, key));
        if (!delivery)
            continue;
        for (const candidate of candidates) {
            const note = {
                amount: delivery.amount,
                ownerPk,
                policy: policyHash(candidate.policy),
                label: candidate.label,
                box: candidate.box,
                asset: candidate.asset,
                flags: delivery.flags,
                lockUntil: delivery.lockUntil,
                delayFloor: delivery.delayFloor,
                salt: deliverySalt(key),
            };
            if (noteCommitment(note) === transaction.commitments[j]) {
                recovered.push({ index: transaction.firstIndex + j, note, policy: candidate.policy });
                break;
            }
        }
    }
    return recovered;
}
