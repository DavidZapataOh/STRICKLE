import { afterAll, describe, expect, it } from "vitest";
import { FLAG_RELEASED } from "../../src/constants.ts";
import { MerkleTree } from "../../src/merkle.ts";
import { closeProver, executeCircuit } from "../../src/prove.ts";
import { FREE_POLICY, type Policy, policyHash } from "../../src/policy.ts";
import { type SpendSpec, buildSpendInputs, recipientLeaf } from "../../src/witness.ts";
import { World, baseSpend, makeNote } from "./fixture.ts";

afterAll(closeProver);

const run = (spec: SpendSpec) => executeCircuit("spend", buildSpendInputs(spec).inputs);

const PAYEE = 0xabcdn;
const OTHER = 0xdeadn;

function allowlistWith(...recipients: bigint[]): MerkleTree {
  const tree = new MerkleTree(10);
  for (const recipient of recipients) tree.insert(recipientLeaf(recipient));
  return tree;
}

describe("floor", () => {
  const floorPolicy: Policy = { ...FREE_POLICY, floor: 600_000n };

  function withdrawal(amount: bigint, flags = 0): SpendSpec {
    const world = new World();
    const input = world.add(makeNote({ box: "emergency", amount: 1_000_000n, flags, policy: policyHash(floorPolicy) }, floorPolicy), floorPolicy);
    return {
      ...baseSpend(world, input),
      publicAmount: amount,
      recipient: PAYEE,
      outputs: [
        { note: makeNote({ box: "emergency", amount: 1_000_000n - amount, flags, policy: input.note.policy }) },
        { note: makeNote({ amount: 0n, ownerPk: 5n }) },
      ],
    };
  }

  it("allows withdrawing down to exactly the floor", async () => {
    await expect(run(withdrawal(400_000n))).resolves.toBeDefined();
  });

  it("rejects withdrawing below the floor", async () => {
    await expect(run(withdrawal(400_001n))).rejects.toThrow();
  });

  it("allows moving value between the notes of the box without touching the floor", async () => {
    const world = new World();
    const input = world.add(makeNote({ box: "emergency", policy: policyHash(floorPolicy) }, floorPolicy), floorPolicy);
    const spec: SpendSpec = {
      ...baseSpend(world, input),
      outputs: [
        { note: makeNote({ box: "emergency", amount: 300_000n, policy: input.note.policy }) },
        { note: makeNote({ box: "emergency", amount: 700_000n, policy: input.note.policy }) },
      ],
    };
    await expect(run(spec)).resolves.toBeDefined();
  });

  it("rejects moving value below the floor to another box", async () => {
    const world = new World();
    const input = world.add(makeNote({ box: "emergency", policy: policyHash(floorPolicy) }, floorPolicy), floorPolicy);
    const spec: SpendSpec = {
      ...baseSpend(world, input),
      outputs: [
        { note: makeNote({ box: "emergency", amount: 500_000n, policy: input.note.policy }) },
        { note: makeNote({ box: "salary", amount: 500_000n }) },
      ],
    };
    await expect(run(spec)).rejects.toThrow();
  });

  it("lets a released note go below the floor, for the owner", async () => {
    await expect(run(withdrawal(900_000n, FLAG_RELEASED))).resolves.toBeDefined();
  });
});

describe("restricted box (payroll)", () => {
  const payroll: Policy = { ...FREE_POLICY, restricted: true, allowlistRoot: allowlistWith(PAYEE).root };

  function payment(recipient: bigint, flags = 0, members: bigint[] = [PAYEE]): SpendSpec {
    const world = new World();
    const policy: Policy = { ...payroll, allowlistRoot: allowlistWith(...members).root };
    const input = world.add(makeNote({ box: "payroll", flags, policy: policyHash(policy) }, policy), policy);
    return {
      ...baseSpend(world, input),
      publicAmount: 250_000n,
      recipient,
      allowlist: { tree: allowlistWith(...members), index: Math.max(0, members.indexOf(recipient)) },
      outputs: [
        { note: makeNote({ box: "payroll", amount: 750_000n, flags, policy: input.note.policy }) },
        { note: makeNote({ amount: 0n, ownerPk: 5n }) },
      ],
    };
  }

  it("pays an approved recipient", async () => {
    await expect(run(payment(PAYEE))).resolves.toBeDefined();
  });

  it("rejects paying someone who is not on the list", async () => {
    await expect(run(payment(OTHER))).rejects.toThrow();
  });

  it("rejects an approved recipient whose Merkle proof belongs to another list position", async () => {
    const spec = payment(PAYEE, 0, [OTHER, PAYEE]);
    spec.allowlist = { tree: allowlistWith(OTHER, PAYEE), index: 0 };
    await expect(run(spec)).rejects.toThrow();
  });

  it("lets a released payroll note pay anyone", async () => {
    await expect(run(payment(OTHER, FLAG_RELEASED))).resolves.toBeDefined();
  });

  it("rejects moving restricted value to another box unless released", async () => {
    const world = new World();
    const input = world.add(makeNote({ box: "payroll", policy: policyHash(payroll) }, payroll), payroll);
    const spec = baseSpend(world, input);
    await expect(run(spec)).rejects.toThrow();
  });

  it("lets a released restricted note move to another box", async () => {
    const world = new World();
    const input = world.add(makeNote({ box: "payroll", flags: FLAG_RELEASED, policy: policyHash(payroll) }, payroll), payroll);
    await expect(run(baseSpend(world, input))).resolves.toBeDefined();
  });

  it("rejects sending restricted value privately to another owner", async () => {
    const world = new World();
    const input = world.add(makeNote({ box: "payroll", policy: policyHash(payroll) }, payroll), payroll);
    const spec: SpendSpec = {
      ...baseSpend(world, input),
      outputs: [
        { note: makeNote({ box: "payroll", amount: 500_000n, policy: input.note.policy }) },
        { note: makeNote({ box: "payroll", amount: 500_000n, ownerPk: 99n }) },
      ],
    };
    await expect(run(spec)).rejects.toThrow();
  });
});
