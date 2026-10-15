import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { FIELD_MODULUS } from "../src/field.ts";
import { MerkleTree, zeroHashes } from "../src/merkle.ts";
import { hash } from "../src/poseidon.ts";

const leaf = fc.bigInt({ min: 0n, max: FIELD_MODULUS - 1n });

function naiveRoot(leaves: bigint[], depth: number): bigint {
  const zeros = zeroHashes(depth);
  let level = leaves;
  for (let height = 0; height < depth; height++) {
    const next: bigint[] = [];
    for (let i = 0; i < Math.max(1, Math.ceil(level.length / 2)); i++) {
      next.push(hash([level[2 * i] ?? zeros[height] ?? 0n, level[2 * i + 1] ?? zeros[height] ?? 0n]));
    }
    level = next;
  }
  return level[0] ?? 0n;
}

describe("zeroHashes", () => {
  it("chains empty subtrees", () => {
    const zeros = zeroHashes(3);
    expect(zeros).toHaveLength(4);
    expect(zeros[0]).toBe(0n);
    expect(zeros[1]).toBe(hash([0n, 0n]));
    expect(zeros[2]).toBe(hash([zeros[1] ?? 0n, zeros[1] ?? 0n]));
  });
});

describe("MerkleTree", () => {
  it("starts with the empty root and no leaves", () => {
    const tree = new MerkleTree(4);
    expect(tree.size).toBe(0);
    expect(tree.root).toBe(zeroHashes(4)[4]);
  });

  it("matches a naive full recomputation for any sequence of leaves", () => {
    fc.assert(
      fc.property(fc.array(leaf, { minLength: 1, maxLength: 20 }), (leaves) => {
        const tree = new MerkleTree(6);
        for (const value of leaves) tree.insert(value);
        expect(tree.root).toBe(naiveRoot(leaves, 6));
      }),
      { numRuns: 40 },
    );
  });

  it("inserts pairs exactly like two single inserts and reports indexes and roots", () => {
    const single = new MerkleTree(5);
    const paired = new MerkleTree(5);
    single.insert(10n);
    single.insert(20n);
    expect(paired.insertPair(10n, 20n)).toEqual({ index: 0, root: single.root });
    expect(paired.insertPair(30n, 40n).index).toBe(2);
    expect(paired.size).toBe(4);
  });

  it("refuses a pair at an odd position and a full tree", () => {
    const tree = new MerkleTree(2);
    tree.insert(1n);
    expect(() => tree.insertPair(2n, 3n)).toThrow(/even/);
    tree.insert(2n);
    tree.insertPair(3n, 4n);
    expect(() => tree.insert(5n)).toThrow(/full/);
  });

  it("rejects values that are not field elements", () => {
    expect(() => new MerkleTree(3).insert(FIELD_MODULUS)).toThrow(RangeError);
  });

  it("produces membership paths that rebuild the root, and only for the right leaf and index", () => {
    const tree = new MerkleTree(6);
    const leaves = [11n, 22n, 33n, 44n, 55n, 66n, 77n];
    for (const value of leaves) tree.insert(value);
    leaves.forEach((value, index) => {
      const path = tree.path(index);
      expect(path).toHaveLength(6);
      expect(MerkleTree.rootFromPath(value, index, path)).toBe(tree.root);
      expect(MerkleTree.rootFromPath(value + 1n, index, path)).not.toBe(tree.root);
      expect(MerkleTree.rootFromPath(value, index ^ 1, path)).not.toBe(tree.root);
    });
  });

  it("gives paths for empty positions of a partly filled tree", () => {
    const tree = new MerkleTree(4);
    tree.insert(5n);
    expect(MerkleTree.rootFromPath(0n, 9, tree.path(9))).toBe(tree.root);
  });
});
