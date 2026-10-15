import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { DOMAIN, FLAG_RELEASED } from "../src/constants.ts";
import { FIELD_MODULUS } from "../src/field.ts";
import { type Note, assertNote, noteCommitment, noteNullifier, packMeta, unpackMeta } from "../src/note.ts";
import { hash } from "../src/poseidon.ts";

const base: Note = {
  amount: 1_234_567n,
  ownerPk: 111n,
  policy: 222n,
  label: 333n,
  box: "taxes",
  asset: "USDC",
  flags: 0,
  lockUntil: 1_800_000_000n,
  salt: 444n,
};

const fieldElement = fc.bigInt({ min: 0n, max: FIELD_MODULUS - 1n });
const noteArbitrary: fc.Arbitrary<Note> = fc.record({
  amount: fc.bigInt({ min: 0n, max: 2n ** 64n - 1n }),
  ownerPk: fieldElement,
  policy: fieldElement,
  label: fieldElement,
  box: fc.constantFrom("taxes", "payroll", "salary", "operating", "emergency", "profit"),
  asset: fc.constantFrom("USDC", "EURC"),
  flags: fc.constantFrom(0, FLAG_RELEASED),
  lockUntil: fc.bigInt({ min: 0n, max: 2n ** 64n - 1n }),
  salt: fieldElement,
});

describe("meta packing", () => {
  it("packs box, asset, flags and lockUntil into one field element", () => {
    const note: Note = { ...base, box: "profit", asset: "EURC", flags: 1, lockUntil: 5n };
    expect(packMeta(note)).toBe(6n + 2n * 2n ** 8n + 1n * 2n ** 16n + 5n * 2n ** 32n);
  });

  it("round-trips for every valid note and stays below the field modulus", () => {
    fc.assert(
      fc.property(noteArbitrary, (note) => {
        const meta = packMeta(note);
        expect(meta).toBeLessThan(2n ** 96n);
        expect(unpackMeta(meta)).toEqual({ box: note.box, asset: note.asset, flags: note.flags, lockUntil: note.lockUntil });
      }),
    );
  });
});

describe("noteCommitment", () => {
  it("hashes the fields in the documented order under the note tag", () => {
    expect(noteCommitment(base)).toBe(hash([DOMAIN.NOTE, 1_234_567n, 111n, 222n, 333n, packMeta(base), 444n]));
  });

  it("changes when any single field changes", () => {
    const variants: Note[] = [
      { ...base, amount: base.amount + 1n },
      { ...base, ownerPk: base.ownerPk + 1n },
      { ...base, policy: base.policy + 1n },
      { ...base, label: base.label + 1n },
      { ...base, box: "payroll" },
      { ...base, asset: "EURC" },
      { ...base, flags: FLAG_RELEASED },
      { ...base, lockUntil: base.lockUntil + 1n },
      { ...base, salt: base.salt + 1n },
    ];
    const commitments = new Set([noteCommitment(base), ...variants.map(noteCommitment)]);
    expect(commitments.size).toBe(variants.length + 1);
  });

  it("is injective on random notes (no accidental collisions in the packing)", () => {
    fc.assert(
      fc.property(noteArbitrary, noteArbitrary, (a, b) => {
        fc.pre(JSON.stringify(a, (_, v) => (typeof v === "bigint" ? v.toString() : v)) !== JSON.stringify(b, (_, v) => (typeof v === "bigint" ? v.toString() : v)));
        expect(noteCommitment(a)).not.toBe(noteCommitment(b));
      }),
      { numRuns: 100 },
    );
  });
});

describe("assertNote", () => {
  it.each([
    ["amount beyond u64", { amount: 2n ** 64n }],
    ["negative amount", { amount: -1n }],
    ["lockUntil beyond u64", { lockUntil: 2n ** 64n }],
    ["owner not a field element", { ownerPk: FIELD_MODULUS }],
    ["policy not a field element", { policy: FIELD_MODULUS }],
    ["label not a field element", { label: -1n }],
    ["salt not a field element", { salt: FIELD_MODULUS }],
    ["unknown flag bits", { flags: 2 }],
    ["fractional flags", { flags: 0.5 }],
  ])("rejects %s", (_name, patch) => {
    expect(() => assertNote({ ...base, ...patch })).toThrow(RangeError);
    expect(() => noteCommitment({ ...base, ...patch })).toThrow(RangeError);
  });

  it("accepts the boundary values", () => {
    expect(() => assertNote({ ...base, amount: 0n, lockUntil: 0n })).not.toThrow();
    expect(() => assertNote({ ...base, amount: 2n ** 64n - 1n, lockUntil: 2n ** 64n - 1n })).not.toThrow();
  });
});

describe("noteNullifier", () => {
  const nk = 999n;
  const commitment = noteCommitment(base);

  it("hashes nk, commitment and leaf index under the nullifier tag", () => {
    expect(noteNullifier(nk, commitment, 7)).toBe(hash([DOMAIN.NULLIFIER, nk, commitment, 7n]));
  });

  it("differs for another key, another note or another position", () => {
    const original = noteNullifier(nk, commitment, 7);
    expect(noteNullifier(nk + 1n, commitment, 7)).not.toBe(original);
    expect(noteNullifier(nk, commitment + 1n, 7)).not.toBe(original);
    expect(noteNullifier(nk, commitment, 8)).not.toBe(original);
  });

  it("accepts the first and last leaf and rejects an index outside the tree", () => {
    expect(() => noteNullifier(nk, commitment, 0)).not.toThrow();
    expect(() => noteNullifier(nk, commitment, 2 ** 24 - 1)).not.toThrow();
    expect(() => noteNullifier(nk, commitment, 2 ** 24)).toThrow(RangeError);
    expect(() => noteNullifier(nk, commitment, -1)).toThrow(RangeError);
    expect(() => noteNullifier(nk, commitment, 1.5)).toThrow(RangeError);
  });
});
