import { ASSET_ID, DOMAIN, FLAG_RELEASED, TREE_DEPTH, assetFromId, boxFromId, boxId } from "./constants.js";
import { assertField, assertUint } from "./field.js";
import { hash } from "./poseidon.js";
export function assertNote(note) {
    assertUint(note.amount, 64, "amount");
    assertUint(note.lockUntil, 64, "lockUntil");
    assertUint(BigInt(note.delayFloor), 32, "delayFloor");
    assertField(note.ownerPk, "ownerPk");
    assertField(note.policy, "policy");
    assertField(note.label, "label");
    assertField(note.salt, "salt");
    if (note.flags !== 0 && note.flags !== FLAG_RELEASED)
        throw new RangeError(`flags must be 0 or ${FLAG_RELEASED}`);
}
export function packMeta(note) {
    return (BigInt(boxId(note.box)) +
        BigInt(ASSET_ID[note.asset]) * 2n ** 8n +
        BigInt(note.flags) * 2n ** 16n +
        note.lockUntil * 2n ** 32n +
        BigInt(note.delayFloor) * 2n ** 96n);
}
export function unpackMeta(meta) {
    return {
        box: boxFromId(Number(meta & 0xffn)),
        asset: assetFromId(Number((meta >> 8n) & 0xffn)),
        flags: Number((meta >> 16n) & 0xffffn),
        lockUntil: (meta >> 32n) & (2n ** 64n - 1n),
        delayFloor: Number(meta >> 96n),
    };
}
export function noteCommitment(note) {
    assertNote(note);
    return hash([DOMAIN.NOTE, note.amount, note.ownerPk, note.policy, note.label, packMeta(note), note.salt]);
}
export function noteNullifier(nk, commitment, leafIndex) {
    if (!Number.isInteger(leafIndex) || leafIndex < 0 || leafIndex >= 2 ** TREE_DEPTH) {
        throw new RangeError(`leafIndex must be an integer in 0..${2 ** TREE_DEPTH - 1}`);
    }
    return hash([DOMAIN.NULLIFIER, nk, commitment, BigInt(leafIndex)]);
}
