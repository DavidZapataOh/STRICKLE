import { MerkleTree } from "./merkle.js";
/** Off-chain mirror of the pool tree: append what the contract appends, in event order. */
export class PoolLedger {
    tree = new MerkleTree();
    #leaves = new Map();
    get root() {
        return this.tree.root;
    }
    get size() {
        return this.tree.size;
    }
    append(c0, c1) {
        const { index } = this.tree.insertPair(c0, c1);
        if (c0 !== 0n)
            this.#leaves.set(c0, index);
        if (c1 !== 0n)
            this.#leaves.set(c1, index + 1);
        return index;
    }
    find(commitment) {
        return this.#leaves.get(commitment);
    }
}
