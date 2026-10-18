import { ASSOCIATION_DEPTH } from "./constants.js";
import { MerkleTree } from "./merkle.js";
import { FIELD_MODULUS } from "./field.js";
/**
 * The labels of the deposits whose depositor was clear when it deposited. Elevated, blocked and never
 * screened depositors are left out: absence from a set says nothing about them, presence vouches for them.
 */
export function buildAssociationSet(args) {
    const seen = new Set();
    const labels = [];
    for (const deposit of args.deposits) {
        if (deposit.label <= 0n || deposit.label >= FIELD_MODULUS)
            throw new RangeError("a deposit label must be a non-zero field element");
        if (seen.has(deposit.label))
            throw new Error(`duplicate deposit label ${deposit.label}`);
        seen.add(deposit.label);
        if (args.statusOf(deposit.depositor, deposit.timestamp) === 0)
            labels.push(deposit.label);
    }
    const tree = new MerkleTree(ASSOCIATION_DEPTH);
    for (const label of labels)
        tree.insert(label);
    return {
        labels,
        tree,
        proofFor(label) {
            const index = labels.indexOf(label);
            if (index < 0)
                throw new Error("the label is not in the set");
            return { index, tree };
        },
    };
}
