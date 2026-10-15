import { afterAll, describe, expect, it } from "vitest";
import { DOMAIN } from "../../src/constants.ts";
import { toHex32 } from "../../src/field.ts";
import { MerkleTree } from "../../src/merkle.ts";
import { hash } from "../../src/poseidon.ts";
import { closeProver, executeCircuit } from "../../src/prove.ts";
import { type SpendSpec, buildSpendInputs } from "../../src/witness.ts";
import { World, baseSpend, makeNote } from "./fixture.ts";

afterAll(closeProver);

const run = (spec: SpendSpec) => executeCircuit("spend", buildSpendInputs(spec).inputs);
const LABEL = 0x7777n;

function labelled(world = new World(), label = LABEL) {
  const input = world.add(makeNote({ label }));
  return { world, input };
}

describe("labels", () => {
  it("keeps the label on every output of a labelled input", async () => {
    const { world, input } = labelled();
    const spec = baseSpend(world, input);
    spec.outputs = [
      { note: makeNote({ amount: 500_000n, box: "salary", policy: input.note.policy, label: LABEL }) },
      { note: makeNote({ amount: 500_000n, box: "profit", policy: input.note.policy, label: LABEL }) },
    ];
    await expect(run(spec)).resolves.toBeDefined();
  });

  it("lets an output degrade to the unattested label 0", async () => {
    const { world, input } = labelled();
    const spec = baseSpend(world, input);
    spec.outputs[0].note = makeNote({ amount: 500_000n, box: "salary", policy: input.note.policy, label: 0n });
    await expect(run(spec)).resolves.toBeDefined();
  });

  it("rejects an output that invents a label", async () => {
    const { world, input } = labelled();
    const spec = baseSpend(world, input);
    spec.outputs[0].note = makeNote({ amount: 500_000n, box: "salary", policy: input.note.policy, label: LABEL + 1n });
    await expect(run(spec)).rejects.toThrow();
  });

  it("rejects gaining a label from an unattested input", async () => {
    const { world, input } = labelled(new World(), 0n);
    const spec = baseSpend(world, input);
    spec.outputs[0].note = makeNote({ amount: 500_000n, box: "salary", policy: input.note.policy, label: LABEL });
    await expect(run(spec)).rejects.toThrow();
  });

  it("forces label 0 when two different labels are merged", async () => {
    const world = new World();
    const a = world.add(makeNote({ label: 1n }));
    const b = world.add(makeNote({ label: 2n }));
    const spec: SpendSpec = {
      ...baseSpend(world, a),
      inputs: [a, b],
      outputs: [{ note: makeNote({ amount: 2_000_000n, label: 0n }) }, { note: makeNote({ amount: 0n, ownerPk: 5n }) }],
    };
    await expect(run(spec)).resolves.toBeDefined();
    spec.outputs[0].note = makeNote({ amount: 2_000_000n, label: 1n });
    await expect(run(spec)).rejects.toThrow();
  });

  it("allows merging two inputs with the same label and keeping it", async () => {
    const world = new World();
    const a = world.add(makeNote({ label: LABEL }));
    const b = world.add(makeNote({ label: LABEL }));
    const spec: SpendSpec = {
      ...baseSpend(world, a),
      inputs: [a, b],
      outputs: [{ note: makeNote({ amount: 2_000_000n, label: LABEL }) }, { note: makeNote({ amount: 0n, ownerPk: 5n }) }],
    };
    await expect(run(spec)).resolves.toBeDefined();
  });
});

describe("association set", () => {
  function withdrawal(label: bigint, set: bigint[], position: number): SpendSpec {
    const { world, input } = labelled(new World(), label);
    const tree = new MerkleTree(20);
    for (const member of set) tree.insert(member);
    return {
      ...baseSpend(world, input),
      publicAmount: 400_000n,
      recipient: 0x1111n,
      association: { tree, index: position },
      outputs: [{ note: makeNote({ amount: 600_000n, label }) }, { note: makeNote({ amount: 0n, ownerPk: 5n }) }],
    };
  }

  it("proves membership of the label in the association tree on withdrawal", async () => {
    await expect(run(withdrawal(LABEL, [5n, LABEL, 9n], 1))).resolves.toBeDefined();
  });

  it("rejects a label that is not in the set", async () => {
    await expect(run(withdrawal(LABEL, [5n, 9n], 0))).rejects.toThrow();
  });

  it("rejects a withdrawal with an association root but an unattested note", async () => {
    await expect(run(withdrawal(0n, [0n], 0))).rejects.toThrow();
  });

  it("does not require membership when no association root is given", async () => {
    const { world, input } = labelled();
    const spec: SpendSpec = {
      ...baseSpend(world, input),
      publicAmount: 400_000n,
      recipient: 0x1111n,
      outputs: [{ note: makeNote({ amount: 600_000n, label: LABEL }) }, { note: makeNote({ amount: 0n, ownerPk: 5n }) }],
    };
    await expect(run(spec)).resolves.toBeDefined();
  });
});

describe("well-formed outputs", () => {
  /** An output whose commitment is consistent with an out-of-range box or flags value. */
  async function forged(box: number, flags: number) {
    const spec = baseSpend(new World());
    const built = buildSpendInputs(spec).inputs as { commitments: string[]; outputs: { note: Record<string, string | number> }[] };
    const note = built.outputs[0]!.note;
    const meta = BigInt(box) + BigInt(note.asset as number) * 2n ** 8n + BigInt(flags) * 2n ** 16n + BigInt(note.lock_until as string) * 2n ** 32n;
    const commitment = hash([DOMAIN.NOTE, BigInt(note.amount as string), BigInt(note.owner_pk as string), BigInt(note.policy as string), BigInt(note.label as string), meta, BigInt(note.salt as string)]);
    built.outputs[0] = { ...built.outputs[0]!, note: { ...note, box_id: box, flags } };
    built.commitments[0] = toHex32(commitment);
    return executeCircuit("spend", built as never);
  }

  it("accepts the forging helper with in-range values (so the rejections below are about the range)", async () => {
    await expect(forged(3, 0)).resolves.toBeDefined();
  });

  it("rejects box 0, box 7 and unknown flags on a committed output", async () => {
    await expect(forged(0, 0)).rejects.toThrow();
    await expect(forged(7, 0)).rejects.toThrow();
    await expect(forged(3, 2)).rejects.toThrow();
  });

  it("rejects a time beyond 2^48", async () => {
    const spec = baseSpend(new World());
    spec.now = 2n ** 48n;
    await expect(run(spec)).rejects.toThrow();
  });
});
