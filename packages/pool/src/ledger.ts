import { MerkleTree } from "./merkle.ts";

/** Off-chain mirror of the pool tree: append what the contract appends, in event order. */
export class PoolLedger {
  readonly tree = new MerkleTree();

  get root(): bigint {
    return this.tree.root;
  }

  append(c0: bigint, c1: bigint): number {
    return this.tree.insertPair(c0, c1).index;
  }
}
