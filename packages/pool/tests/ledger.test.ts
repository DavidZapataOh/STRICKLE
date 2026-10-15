import { describe, expect, it } from "vitest";
import { MerkleTree } from "../src/merkle.ts";
import { PoolLedger } from "../src/ledger.ts";

describe("PoolLedger", () => {
  it("appends pairs at even indexes and tracks the tree root", () => {
    const ledger = new PoolLedger();
    expect(ledger.append(11n, 0n)).toBe(0);
    expect(ledger.append(22n, 33n)).toBe(2);
    const reference = new MerkleTree();
    reference.insertPair(11n, 0n);
    reference.insertPair(22n, 33n);
    expect(ledger.root).toBe(reference.root);
    expect(ledger.tree.size).toBe(4);
  });
});
