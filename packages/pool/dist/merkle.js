import { TREE_DEPTH } from "./constants.js";
import { assertField } from "./field.js";
import { hash } from "./poseidon.js";
export function zeroHashes(depth) {
    const zeros = [0n];
    for (let level = 0; level < depth; level++) {
        const previous = zeros[level] ?? 0n;
        zeros.push(hash([previous, previous]));
    }
    return zeros;
}
export class MerkleTree {
    depth;
    zeros;
    #nodes = new Map();
    #size = 0;
    constructor(depth = TREE_DEPTH) {
        this.depth = depth;
        this.zeros = zeroHashes(depth);
    }
    get size() {
        return this.#size;
    }
    get root() {
        return this.#node(this.depth, 0);
    }
    #node(level, index) {
        return this.#nodes.get(`${level}:${index}`) ?? this.zeros[level] ?? 0n;
    }
    insert(leaf) {
        assertField(leaf, "leaf");
        if (this.#size >= 2 ** this.depth)
            throw new RangeError("the tree is full");
        const index = this.#size++;
        this.#nodes.set(`0:${index}`, leaf);
        let position = index;
        for (let level = 0; level < this.depth; level++) {
            const parent = position >> 1;
            const node = hash([this.#node(level, parent * 2), this.#node(level, parent * 2 + 1)]);
            this.#nodes.set(`${level + 1}:${parent}`, node);
            position = parent;
        }
        return index;
    }
    insertPair(a, b) {
        if (this.#size % 2 !== 0)
            throw new RangeError("a pair must start at an even index");
        const index = this.insert(a);
        this.insert(b);
        return { index, root: this.root };
    }
    path(index) {
        if (!Number.isInteger(index) || index < 0 || index >= 2 ** this.depth)
            throw new RangeError("index outside the tree");
        const siblings = [];
        let position = index;
        for (let level = 0; level < this.depth; level++) {
            siblings.push(this.#node(level, position ^ 1));
            position >>= 1;
        }
        return siblings;
    }
    static rootFromPath(leaf, index, siblings) {
        let node = leaf;
        let position = index;
        for (const sibling of siblings) {
            node = position % 2 === 0 ? hash([node, sibling]) : hash([sibling, node]);
            position = Math.floor(position / 2);
        }
        return node;
    }
}
