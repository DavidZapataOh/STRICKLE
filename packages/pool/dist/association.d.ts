import { MerkleTree } from "./merkle.ts";
import type { Address } from "viem";
export interface DepositRecord {
    depositor: Address;
    label: bigint;
    timestamp: number;
}
export interface AssociationSet {
    labels: bigint[];
    tree: MerkleTree;
    proofFor(label: bigint): {
        index: number;
        tree: MerkleTree;
    };
}
/**
 * The labels of the deposits whose depositor was clear when it deposited. Elevated, blocked and never
 * screened depositors are left out: absence from a set says nothing about them, presence vouches for them.
 */
export declare function buildAssociationSet(args: {
    deposits: DepositRecord[];
    statusOf(address: Address, timestamp: number): 0 | 1 | 2 | undefined;
}): AssociationSet;
