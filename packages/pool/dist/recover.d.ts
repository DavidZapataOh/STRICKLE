import type { Asset, BoxKind } from "@strickle/core";
import { type Note } from "./note.ts";
import { type Policy } from "./policy.ts";
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
export declare function recoverSelfNotes(args: {
    nk: bigint;
    ownerPk: bigint;
    transaction: SpentTransaction;
    candidates: Candidate[];
}): RecoveredNote[];
