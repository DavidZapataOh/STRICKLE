import type { Asset, BoxKind } from "@strickle/core";
import { decryptDelivery, deliveryKey, deliverySalt, unpackDelivery } from "./delivery.ts";
import { type Note, noteCommitment } from "./note.ts";
import { type Policy, policyHash } from "./policy.ts";

export interface SpentTransaction {
  nullifier0: bigint;
  commitments: [bigint, bigint];
  enc: [bigint, bigint];
  firstIndex: number;
}

/** A (box, policy, label) the owner may have created; the chain only commits to their hash. */
export interface Candidate {
  box: BoxKind;
  asset: Asset;
  policy: Policy;
  label: bigint;
}

export interface RecoveredNote {
  index: number;
  note: Note;
  policy: Policy;
}

/** Rebuilds the outputs a spend kept for its owner from public data and `nk`, with no ciphertext. */
export function recoverSelfNotes(args: { nk: bigint; ownerPk: bigint; transaction: SpentTransaction; candidates: Candidate[] }): RecoveredNote[] {
  const { nk, ownerPk, transaction, candidates } = args;
  const recovered: RecoveredNote[] = [];
  for (const j of [0, 1] as const) {
    const enc = transaction.enc[j];
    if (enc === 0n) continue;
    const key = deliveryKey(nk, transaction.nullifier0, j);
    const delivery = unpackDelivery(decryptDelivery(enc, key));
    if (!delivery) continue;
    for (const candidate of candidates) {
      const note: Note = {
        amount: delivery.amount,
        ownerPk,
        policy: policyHash(candidate.policy),
        label: candidate.label,
        box: candidate.box,
        asset: candidate.asset,
        flags: delivery.flags,
        lockUntil: delivery.lockUntil,
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
