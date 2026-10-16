// packages/pool/tests/witness-enc.test.ts
import { describe, expect, it } from "vitest";
import { FREE_POLICY, policyHash } from "../src/policy.ts";
import { deriveOutputNotes, withDummies } from "../src/witness.ts";
import { FIELD_MODULUS, randomField } from "../src/field.ts";
import { MerkleTree } from "../src/merkle.ts";
import { type Note, noteCommitment } from "../src/note.ts";

const note = (amount: bigint, ownerPk: bigint, salt: bigint): Note => ({ amount, ownerPk, policy: policyHash(FREE_POLICY), label: 1n, box: "operating", asset: "USDC", flags: 0, lockUntil: 0n, delayFloor: 0, salt });

describe("randomField", () => {
  it("is below the modulus and different each time, with no crypto global needed", () => {
    const draws = new Set(Array.from({ length: 20 }, () => randomField()));
    expect(draws.size).toBe(20);
    for (const value of draws) expect(value < FIELD_MODULUS).toBe(true);
  });
});

describe("a spec can fix the delivery values of outputs the owner does not keep", () => {
  const input = note(1_000n, 7n, 3n);
  const base = {
    tree: new MerkleTree(),
    inputs: [{ note: input, policy: FREE_POLICY, leafIndex: 0 }, null] as const,
    outputs: [{ note: note(600n, 7n, 0n) }, { note: note(0n, 5n, 9n) }] as const,
    signer: { kind: "agent" as const, ak: 1n, nk: 2n, authHash: 3n },
    dummyNk: [11n, 12n] as [bigint, bigint],
    dummySalt: [13n, 14n] as [bigint, bigint],
  };

  it("uses the supplied value and is therefore reproducible", () => {
    const spec = { ...base, inputs: [...base.inputs], outputs: [...base.outputs], enc: [21n, 22n] as [bigint, bigint] };
    const a = deriveOutputNotes(withDummies(spec as never));
    const b = deriveOutputNotes(withDummies(spec as never));
    expect(a.enc[1]).toBe(22n);
    expect(b).toEqual(a);
  });

  it("still draws fresh values when none are supplied", () => {
    const spec = { ...base, inputs: [...base.inputs], outputs: [...base.outputs] };
    const a = deriveOutputNotes(withDummies(spec as never));
    const b = deriveOutputNotes(withDummies(spec as never));
    expect(a.enc[1]).not.toBe(b.enc[1]);
    expect(noteCommitment(a.notes[0] as Note)).toBe(noteCommitment(b.notes[0] as Note));
  });

  it("derives the output notes without a ledger tree, which only the proof needs", () => {
    const spec = { signer: base.signer, dummyNk: base.dummyNk, dummySalt: base.dummySalt, inputs: [...base.inputs], outputs: [...base.outputs], enc: [21n, 22n] as [bigint, bigint] };
    expect(deriveOutputNotes(withDummies(spec as never)).enc[1]).toBe(22n);
  });
});
