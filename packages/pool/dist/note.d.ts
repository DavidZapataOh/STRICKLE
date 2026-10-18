import type { Asset, BoxKind } from "@strickle/core";
export interface Note {
    amount: bigint;
    ownerPk: bigint;
    policy: bigint;
    label: bigint;
    box: BoxKind;
    asset: Asset;
    flags: number;
    lockUntil: bigint;
    /** Longest release delay ever applied to this note's lineage; it can only grow along owner-kept outputs. */
    delayFloor: number;
    salt: bigint;
}
export declare function assertNote(note: Note): void;
export declare function packMeta(note: Pick<Note, "box" | "asset" | "flags" | "lockUntil" | "delayFloor">): bigint;
export declare function unpackMeta(meta: bigint): Pick<Note, "box" | "asset" | "flags" | "lockUntil" | "delayFloor">;
export declare function noteCommitment(note: Note): bigint;
export declare function noteNullifier(nk: bigint, commitment: bigint, leafIndex: number): bigint;
