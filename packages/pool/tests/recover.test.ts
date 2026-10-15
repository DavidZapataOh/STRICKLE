import { describe, expect, it } from "vitest";
import { FREE_POLICY, type Policy } from "../src/policy.ts";
import { type Candidate, type SpentTransaction, recoverSelfNotes } from "../src/recover.ts";
import { buildSpendInputs } from "../src/witness.ts";
import { World, baseSpend, makeNote, user } from "./circuits/fixture.ts";

function transactionOf(built: ReturnType<typeof buildSpendInputs>, firstIndex: number): SpentTransaction {
  const pi = built.publicInputs;
  return { nullifier0: pi[1] as bigint, commitments: [pi[3] as bigint, pi[4] as bigint], enc: [pi[11] as bigint, pi[12] as bigint], firstIndex };
}

const salary: Candidate = { box: "salary", asset: "USDC", policy: FREE_POLICY, label: 0n };
const profit: Candidate = { box: "profit", asset: "USDC", policy: FREE_POLICY, label: 0n };
const decoy: Candidate = { box: "taxes", asset: "USDC", policy: { ...FREE_POLICY, floor: 5n } as Policy, label: 0n };

describe("recoverSelfNotes", () => {
  it("rebuilds both outputs of a spend from public data and the nullifier key", () => {
    const built = buildSpendInputs(baseSpend(new World()));
    const found = recoverSelfNotes({ nk: user.nk, ownerPk: user.pk, transaction: transactionOf(built, 8), candidates: [decoy, salary, profit] });
    expect(found.map((f) => f.index)).toEqual([8, 9]);
    expect(found.map((f) => f.note)).toEqual(built.outputNotes);
    expect(found.map((f) => f.policy)).toEqual([FREE_POLICY, FREE_POLICY]);
  });

  it("recovers nothing with another nullifier key", () => {
    const built = buildSpendInputs(baseSpend(new World()));
    expect(recoverSelfNotes({ nk: user.nk + 1n, ownerPk: user.pk, transaction: transactionOf(built, 0), candidates: [salary, profit] })).toEqual([]);
  });

  it("skips an output whose policy is not among the candidates but keeps the other", () => {
    const built = buildSpendInputs(baseSpend(new World()));
    const found = recoverSelfNotes({ nk: user.nk, ownerPk: user.pk, transaction: transactionOf(built, 4), candidates: [salary] });
    expect(found).toHaveLength(1);
    expect(found[0]?.index).toBe(4);
    expect(found[0]?.note.box).toBe("salary");
  });

  it("ignores an output sent to another owner (no delivery)", () => {
    const world = new World();
    const spec = baseSpend(world);
    const input = spec.inputs[0]!;
    spec.outputs = [{ note: makeNote({ amount: 400_000n, box: "salary", policy: input.note.policy }) }, { note: makeNote({ amount: 600_000n, ownerPk: 99n, policy: input.note.policy }) }];
    const built = buildSpendInputs(spec);
    const found = recoverSelfNotes({ nk: user.nk, ownerPk: user.pk, transaction: transactionOf(built, 0), candidates: [salary, profit] });
    expect(found.map((f) => f.index)).toEqual([0]);
  });

  it("recovers independent transactions of the same owner without mixing them up", () => {
    const first = buildSpendInputs(baseSpend(new World()));
    const second = buildSpendInputs(baseSpend(new World()));
    const a = recoverSelfNotes({ nk: user.nk, ownerPk: user.pk, transaction: transactionOf(first, 0), candidates: [salary, profit] });
    const b = recoverSelfNotes({ nk: user.nk, ownerPk: user.pk, transaction: transactionOf(second, 2), candidates: [salary, profit] });
    expect(a.map((f) => f.note)).toEqual(first.outputNotes);
    expect(b.map((f) => f.note)).toEqual(second.outputNotes);
    expect(a[0]?.note.salt).not.toBe(b[0]?.note.salt);
  });

  it("does not accept a delivery that decrypts to garbage", () => {
    const built = buildSpendInputs(baseSpend(new World()));
    const transaction = transactionOf(built, 0);
    transaction.enc = [transaction.enc[0] + 1n, transaction.enc[1]];
    const found = recoverSelfNotes({ nk: user.nk, ownerPk: user.pk, transaction, candidates: [salary, profit] });
    expect(found.map((f) => f.index)).toEqual([1]);
  });
});
