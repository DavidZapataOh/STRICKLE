import type { InputMap } from "@noir-lang/noir_js";
import { afterAll, describe, expect, it } from "vitest";
import { closeProver, executeCircuit } from "../../src/prove.ts";
import { type SpendSpec, buildSpendInputs } from "../../src/witness.ts";
import { World, baseSpend, makeNote, user } from "./fixture.ts";

afterAll(closeProver);

const run = (spec: SpendSpec) => executeCircuit("spend", buildSpendInputs(spec).inputs);
const runWith = (spec: SpendSpec, patch: InputMap) =>
  executeCircuit("spend", { ...buildSpendInputs(spec).inputs, ...patch });

describe("spend core: valid transactions", () => {
  it("splits one free note into two boxes of the same owner", async () => {
    await expect(run(baseSpend(new World()))).resolves.toBeDefined();
  });

  it("spends two inputs of the same box into one output and an empty change note", async () => {
    const world = new World();
    const a = world.add(makeNote({ amount: 400_000n }));
    const b = world.add(makeNote({ amount: 600_000n }));
    const spec: SpendSpec = {
      ...baseSpend(world, a),
      inputs: [a, b],
      outputs: [{ note: makeNote({ amount: 1_000_000n }) }, { note: makeNote({ amount: 0n, ownerPk: 5n }) }],
    };
    await expect(run(spec)).resolves.toBeDefined();
  });

  it("withdraws part of a free note to a public recipient", async () => {
    const world = new World();
    const input = world.add(makeNote({ amount: 1_000_000n }));
    const spec: SpendSpec = {
      ...baseSpend(world, input),
      publicAmount: 300_000n,
      recipient: 0x1234n,
      outputs: [{ note: makeNote({ amount: 700_000n }) }, { note: makeNote({ amount: 0n, ownerPk: 5n }) }],
    };
    await expect(run(spec)).resolves.toBeDefined();
  });

  it("works when the real input is in the second slot", async () => {
    const world = new World();
    const input = world.add(makeNote());
    const spec = { ...baseSpend(world, input), inputs: [null, input] as SpendSpec["inputs"] };
    await expect(run(spec)).resolves.toBeDefined();
  });
});

describe("spend core: conservation", () => {
  it("rejects creating one unit", async () => {
    const world = new World();
    const input = world.add(makeNote({ amount: 1_000_000n }));
    const spec = baseSpend(world, input);
    spec.outputs[0].note = makeNote({ amount: 500_001n, box: "salary", policy: input.note.policy });
    await expect(run(spec)).rejects.toThrow();
  });

  it("rejects burning value without a public amount", async () => {
    const world = new World();
    const input = world.add(makeNote({ amount: 1_000_000n }));
    const spec = baseSpend(world, input);
    spec.outputs[0].note = makeNote({ amount: 499_999n, box: "salary", policy: input.note.policy });
    await expect(run(spec)).rejects.toThrow();
  });

  it("cannot wrap around with two huge amounts", async () => {
    const world = new World();
    const big = 2n ** 64n - 1n;
    const a = world.add(makeNote({ amount: big }));
    const b = world.add(makeNote({ amount: big }));
    const spec: SpendSpec = {
      ...baseSpend(world, a),
      inputs: [a, b],
      outputs: [{ note: makeNote({ amount: 2n ** 63n }) }, { note: makeNote({ amount: 2n ** 63n - 2n }) }],
    };
    await expect(run(spec)).rejects.toThrow();
  });

  it("rejects a non-zero dummy input", async () => {
    const world = new World();
    const input = world.add(makeNote({ amount: 1_000_000n }));
    const spec = baseSpend(world, input);
    const inputs = buildSpendInputs(spec).inputs as { inputs: { note: { amount: string } }[] };
    inputs.inputs[1] = { ...inputs.inputs[1], note: { ...inputs.inputs[1]?.note, amount: "5" } } as never;
    await expect(executeCircuit("spend", inputs as never)).rejects.toThrow();
  });

  it("rejects a transaction with no real input", async () => {
    const world = new World();
    const spec: SpendSpec = { ...baseSpend(world), inputs: [null, null], outputs: [{ note: makeNote({ amount: 0n }) }, { note: makeNote({ amount: 0n }) }] };
    await expect(run(spec)).rejects.toThrow();
  });
});

describe("spend core: membership and nullifiers", () => {
  it("rejects an input that is not in the tree", async () => {
    const world = new World();
    const input = world.add(makeNote());
    const stranger = { ...input, note: makeNote({ amount: input.note.amount }) };
    await expect(run(baseSpend(world, stranger))).rejects.toThrow();
  });

  it("rejects a root that does not match the path", async () => {
    const spec = baseSpend(new World());
    await expect(runWith(spec, { root: "0x01" })).rejects.toThrow();
  });

  it("rejects a nullifier that is not derived from the note and its position", async () => {
    const spec = baseSpend(new World());
    const built = buildSpendInputs(spec).inputs as { nullifiers: string[] };
    await expect(runWith(spec, { nullifiers: ["0x1234", built.nullifiers[1] as string] })).rejects.toThrow();
  });

  it("rejects spending the same note in both input slots (equal nullifiers)", async () => {
    const world = new World();
    const input = world.add(makeNote({ amount: 500_000n }));
    const spec: SpendSpec = {
      ...baseSpend(world, input),
      inputs: [input, input],
      outputs: [{ note: makeNote({ amount: 1_000_000n }) }, { note: makeNote({ amount: 0n, ownerPk: 5n }) }],
    };
    await expect(run(spec)).rejects.toThrow();
  });

  it("rejects a commitment that is not the output note", async () => {
    const spec = baseSpend(new World());
    await expect(runWith(spec, { commitments: ["0x01", "0x02"] })).rejects.toThrow();
  });
});

describe("spend core: ownership", () => {
  it("rejects a user secret that does not own the note", async () => {
    const world = new World();
    const spec = { ...baseSpend(world), signer: { kind: "user" as const, sk: user.sk + 1n } };
    await expect(run(spec)).rejects.toThrow();
  });

  it("rejects an input of a different asset than the public asset", async () => {
    const world = new World();
    const input = world.add(makeNote({ asset: "EURC" }));
    await expect(run(baseSpend(world, input))).rejects.toThrow();
  });

  it("rejects two real inputs from different boxes or policies", async () => {
    const world = new World();
    const a = world.add(makeNote({ box: "salary" }));
    const b = world.add(makeNote({ box: "profit" }));
    const spec: SpendSpec = {
      ...baseSpend(world, a),
      inputs: [a, b],
      outputs: [{ note: makeNote({ amount: 2_000_000n }) }, { note: makeNote({ amount: 0n, ownerPk: 5n }) }],
    };
    await expect(run(spec)).rejects.toThrow();
  });

  it("rejects a note whose policy field is not the hash of the supplied policy", async () => {
    const world = new World();
    const input = world.add(makeNote());
    const forged = { ...input, policy: { ...input.policy, floor: 1n } };
    await expect(run(baseSpend(world, forged))).rejects.toThrow();
  });
});
