export declare function zeroHashes(depth: number): bigint[];
export declare class MerkleTree {
    #private;
    readonly depth: number;
    readonly zeros: bigint[];
    constructor(depth?: number);
    get size(): number;
    get root(): bigint;
    insert(leaf: bigint): number;
    insertPair(a: bigint, b: bigint): {
        index: number;
        root: bigint;
    };
    path(index: number): bigint[];
    static rootFromPath(leaf: bigint, index: number, siblings: readonly bigint[]): bigint;
}
