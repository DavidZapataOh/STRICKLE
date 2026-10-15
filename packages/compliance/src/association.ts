import { MerkleTree } from "@strickle/pool/merkle";
import { FIELD_MODULUS } from "@strickle/pool/field";
import type { Address } from "viem";

export const ASSOCIATION_DEPTH = 20;

export interface DepositRecord {
  depositor: Address;
  label: bigint;
  timestamp: number;
}

export interface AssociationSet {
  labels: bigint[];
  tree: MerkleTree;
  proofFor(label: bigint): { index: number; tree: MerkleTree };
}

/**
 * The labels of the deposits whose depositor was clear when it deposited. Elevated, blocked and never
 * screened depositors are left out: absence from a set says nothing about them, presence vouches for them.
 */
export function buildAssociationSet(args: {
  deposits: DepositRecord[];
  statusOf(address: Address, timestamp: number): 0 | 1 | 2 | undefined;
}): AssociationSet {
  const seen = new Set<bigint>();
  const labels: bigint[] = [];
  for (const deposit of args.deposits) {
    if (deposit.label <= 0n || deposit.label >= FIELD_MODULUS) throw new RangeError("a deposit label must be a non-zero field element");
    if (seen.has(deposit.label)) throw new Error(`duplicate deposit label ${deposit.label}`);
    seen.add(deposit.label);
    if (args.statusOf(deposit.depositor, deposit.timestamp) === 0) labels.push(deposit.label);
  }
  const tree = new MerkleTree(ASSOCIATION_DEPTH);
  for (const label of labels) tree.insert(label);
  return {
    labels,
    tree,
    proofFor(label) {
      const index = labels.indexOf(label);
      if (index < 0) throw new Error("the label is not in the set");
      return { index, tree };
    },
  };
}
