import { TREE_DEPTH } from "../../src/constants.ts";
import { authHash, nullifierKey, ownerPk } from "../../src/keys.ts";
import { MerkleTree } from "../../src/merkle.ts";
import { type Note, noteCommitment } from "../../src/note.ts";
import { FREE_POLICY, type Policy, policyHash } from "../../src/policy.ts";
import type { InputSpec, SpendSpec } from "../../src/witness.ts";

export const SK = 123456789012345678901234567890n;
export const AK = 987654321098765432109876543210n;
export const NOW = 1_800_000_000n;
export const user = { sk: SK, authHash: authHash(SK), nk: nullifierKey(SK), pk: ownerPk(SK) };

let saltCounter = 1000n;
export const freshSalt = (): bigint => ++saltCounter;

export function makeNote(overrides: Partial<Note> = {}, policy: Policy = FREE_POLICY): Note {
  return {
    amount: 1_000_000n,
    ownerPk: user.pk,
    policy: policyHash(policy),
    label: 0n,
    box: "operating",
    asset: "USDC",
    flags: 0,
    lockUntil: 0n,
    salt: freshSalt(),
    ...overrides,
  };
}

export class World {
  readonly tree = new MerkleTree(TREE_DEPTH);

  add(note: Note, policy: Policy = FREE_POLICY): InputSpec {
    const companion = makeNote({ amount: 0n, ownerPk: 1n });
    const { index } = this.tree.insertPair(noteCommitment(note), noteCommitment(companion));
    return { note, policy, leafIndex: index };
  }
}

/** A valid baseline: the user splits one free note into two boxes of the same owner. */
export function baseSpend(world: World, input: InputSpec = world.add(makeNote())): SpendSpec {
  const half = input.note.amount / 2n;
  return {
    tree: world.tree,
    inputs: [input, null],
    outputs: [
      { note: makeNote({ amount: half, box: "salary", policy: input.note.policy }) },
      { note: makeNote({ amount: input.note.amount - half, box: "profit", policy: input.note.policy }) },
    ],
    signer: { kind: "user", sk: SK },
    now: NOW,
  };
}
