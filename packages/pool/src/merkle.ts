import { TREE_DEPTH } from "./constants.ts";
import { assertField } from "./field.ts";
import { hash } from "./poseidon.ts";

export function zeroHashes(depth: number): bigint[] {
  const zeros: bigint[] = [0n];
  for (let level = 0; level < depth; level++) {
    const previous = zeros[level] ?? 0n;
    zeros.push(hash([previous, previous]));
  }
  return zeros;
}

export class MerkleTree {
  readonly depth: number;
  readonly zeros: bigint[];
  #nodes = new Map<string, bigint>();
  #size = 0;

  constructor(depth: number = TREE_DEPTH) {
    this.depth = depth;
    this.zeros = zeroHashes(depth);
  }

  get size(): number {
    return this.#size;
  }

  get root(): bigint {
    return this.#node(this.depth, 0);
  }

  #node(level: number, index: number): bigint {
    return this.#nodes.get(`${level}:${index}`) ?? this.zeros[level] ?? 0n;
  }

  insert(leaf: bigint): number {
    assertField(leaf, "leaf");
    if (this.#size >= 2 ** this.depth) throw new RangeError("the tree is full");
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

  insertPair(a: bigint, b: bigint): { index: number; root: bigint } {
    if (this.#size % 2 !== 0) throw new RangeError("a pair must start at an even index");
    const index = this.insert(a);
    this.insert(b);
    return { index, root: this.root };
  }

  path(index: number): bigint[] {
    if (!Number.isInteger(index) || index < 0 || index >= 2 ** this.depth) throw new RangeError("index outside the tree");
    const siblings: bigint[] = [];
    let position = index;
    for (let level = 0; level < this.depth; level++) {
      siblings.push(this.#node(level, position ^ 1));
      position >>= 1;
    }
    return siblings;
  }

  static rootFromPath(leaf: bigint, index: number, siblings: readonly bigint[]): bigint {
    let node = leaf;
    let position = index;
    for (const sibling of siblings) {
      node = position % 2 === 0 ? hash([node, sibling]) : hash([sibling, node]);
      position = Math.floor(position / 2);
    }
    return node;
  }
}
