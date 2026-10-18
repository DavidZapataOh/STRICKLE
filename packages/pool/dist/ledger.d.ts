import { MerkleTree } from "./merkle.ts";
/** Off-chain mirror of the pool tree: append what the contract appends, in event order. */
export declare class PoolLedger {
    #private;
    readonly tree: MerkleTree;
    get root(): bigint;
    get size(): number;
    append(c0: bigint, c1: bigint): number;
    find(commitment: bigint): number | undefined;
}
