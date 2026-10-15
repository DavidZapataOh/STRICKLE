import { MerkleTree } from "./merkle.ts";

/** Off-chain mirror of the pool tree: append what the contract appends, in event order. */
export class PoolLedger {
  readonly tree = new MerkleTree();
  readonly #leaves = new Map<bigint, number>();

  get root(): bigint {
    return this.tree.root;
  }

  get size(): number {
    return this.tree.size;
  }

  append(c0: bigint, c1: bigint): number {
    const { index } = this.tree.insertPair(c0, c1);
    if (c0 !== 0n) this.#leaves.set(c0, index);
    if (c1 !== 0n) this.#leaves.set(c1, index + 1);
    return index;
  }

  find(commitment: bigint): number | undefined {
    return this.#leaves.get(commitment);
  }
}
