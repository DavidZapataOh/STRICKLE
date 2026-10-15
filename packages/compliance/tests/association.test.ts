import { MerkleTree } from "@strickle/pool/merkle";
import { describe, expect, it } from "vitest";
import { buildAssociationSet } from "../src/association.ts";

const a = (n: number) => `0x${n.toString(16).padStart(40, "0")}` as `0x${string}`;
const deposit = (who: number, label: bigint, timestamp = 100) => ({ depositor: a(who), label, timestamp });
const statusOf = (table: Record<number, 0 | 1 | 2>) => (address: `0x${string}`) => table[Number.parseInt(address.slice(2), 16)];

describe("association set builder", () => {
  it("includes the labels of clear depositors in deposit order and nothing else", () => {
    const set = buildAssociationSet({
      deposits: [deposit(1, 11n), deposit(2, 22n), deposit(3, 33n), deposit(4, 44n), deposit(5, 55n)],
      statusOf: statusOf({ 1: 0, 2: 1, 3: 2, 5: 0 }),
    });
    expect(set.labels).toEqual([11n, 55n]);
  });

  it("builds a depth-20 tree over exactly those labels", () => {
    const set = buildAssociationSet({ deposits: [deposit(1, 11n), deposit(2, 22n)], statusOf: statusOf({ 1: 0, 2: 0 }) });
    const reference = new MerkleTree(20);
    reference.insert(11n);
    reference.insert(22n);
    expect(set.tree.root).toBe(reference.root);
    expect(set.tree.depth).toBe(20);
  });

  it("gives each label's position and rejects labels outside the set", () => {
    const set = buildAssociationSet({ deposits: [deposit(1, 11n), deposit(2, 22n), deposit(3, 33n)], statusOf: statusOf({ 1: 0, 2: 2, 3: 0 }) });
    expect(set.proofFor(11n).index).toBe(0);
    expect(set.proofFor(33n).index).toBe(1);
    expect(() => set.proofFor(22n)).toThrow(/not in the set/);
    expect(() => set.proofFor(99n)).toThrow(/not in the set/);
  });

  it("asks for the depositor's status at the time of the deposit", () => {
    const seen: [string, number][] = [];
    buildAssociationSet({
      deposits: [deposit(1, 11n, 500)],
      statusOf: (address, timestamp) => {
        seen.push([address, timestamp]);
        return 0;
      },
    });
    expect(seen).toEqual([[a(1), 500]]);
  });

  it("rejects duplicate labels and labels that are not field elements", () => {
    expect(() => buildAssociationSet({ deposits: [deposit(1, 11n), deposit(2, 11n)], statusOf: () => 0 })).toThrow(/duplicate/i);
    expect(() => buildAssociationSet({ deposits: [deposit(1, 0n)], statusOf: () => 0 })).toThrow(/label/);
    expect(() => buildAssociationSet({ deposits: [deposit(1, 2n ** 254n)], statusOf: () => 0 })).toThrow(/label/);
  });

  it("builds an empty set for no clear depositors", () => {
    const set = buildAssociationSet({ deposits: [deposit(1, 11n)], statusOf: () => undefined });
    expect(set.labels).toEqual([]);
    expect(set.tree.size).toBe(0);
  });
});
