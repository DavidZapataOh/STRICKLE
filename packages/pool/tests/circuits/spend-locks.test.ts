import { afterAll, describe, expect, it } from "vitest";
import { FLAG_RELEASED } from "../../src/constants.ts";
import { closeProver, executeCircuit } from "../../src/prove.ts";
import { FREE_POLICY, type Policy, policyHash } from "../../src/policy.ts";
import { type SpendSpec, buildSpendInputs } from "../../src/witness.ts";
import { NOW, World, baseSpend, makeNote } from "./fixture.ts";

afterAll(closeProver);

const run = (spec: SpendSpec) => executeCircuit("spend", buildSpendInputs(spec).inputs);

const DAY = 86_400n;
const taxPolicy: Policy = { ...FREE_POLICY, releaseDelay: 172_800 };

/** a locked box note and the matching same-shape output with a chosen lock */
function relock(world: World, lockIn: bigint, lockOut: bigint, extra: Partial<SpendSpec> = {}): SpendSpec {
  const input = world.add(makeNote({ box: "taxes", lockUntil: lockIn, policy: policyHash(taxPolicy) }, taxPolicy), taxPolicy);
  return {
    ...baseSpend(world, input),
    outputs: [
      { note: makeNote({ box: "taxes", amount: input.note.amount, lockUntil: lockOut, policy: policyHash(taxPolicy) }) },
      { note: makeNote({ amount: 0n, ownerPk: 5n }) },
    ],
    ...extra,
  };
}

describe("time lock", () => {
  it("lets a locked note be re-issued unchanged with the same lock", async () => {
    await expect(run(relock(new World(), NOW + 30n * DAY, NOW + 30n * DAY))).resolves.toBeDefined();
  });

  it("lets the owner shorten the lock to exactly now + releaseDelay (a release request)", async () => {
    await expect(run(relock(new World(), NOW + 30n * DAY, NOW + 2n * DAY))).resolves.toBeDefined();
  });

  it("rejects shortening below now + releaseDelay", async () => {
    await expect(run(relock(new World(), NOW + 30n * DAY, NOW + 2n * DAY - 1n))).rejects.toThrow();
  });

  it("allows any lock when the remaining lock is already shorter than the delay", async () => {
    await expect(run(relock(new World(), NOW + DAY, NOW + DAY))).resolves.toBeDefined();
    await expect(run(relock(new World(), NOW + DAY, NOW + DAY - 1n))).rejects.toThrow();
  });

  it("rejects a withdrawal from a locked note", async () => {
    const world = new World();
    const spec = relock(world, NOW + 30n * DAY, NOW + 30n * DAY);
    spec.publicAmount = 1n;
    spec.outputs[0].note = makeNote({ box: "taxes", amount: spec.inputs[0]!.note.amount - 1n, lockUntil: NOW + 30n * DAY, policy: policyHash(taxPolicy) });
    await expect(run(spec)).rejects.toThrow();
  });

  it("rejects moving a locked note to another box", async () => {
    const world = new World();
    const spec = relock(world, NOW + 30n * DAY, NOW + 30n * DAY);
    spec.outputs[0].note = makeNote({ box: "salary", amount: spec.inputs[0]!.note.amount });
    await expect(run(spec)).rejects.toThrow();
  });

  it("rejects sending a locked note to another owner", async () => {
    const world = new World();
    const spec = relock(world, NOW + 30n * DAY, NOW + 30n * DAY);
    spec.outputs[0].note = makeNote({ box: "taxes", ownerPk: 99n, amount: spec.inputs[0]!.note.amount, lockUntil: NOW + 30n * DAY, policy: policyHash(taxPolicy) });
    await expect(run(spec)).rejects.toThrow();
  });

  it("lets an unlocked note (lock in the past or equal to now) move freely", async () => {
    const world = new World();
    const input = world.add(makeNote({ lockUntil: NOW }));
    await expect(run(baseSpend(world, input))).resolves.toBeDefined();
  });
});

describe("release delay for policy and flag changes", () => {
  it("rejects setting the released flag without waiting", async () => {
    const world = new World();
    const input = world.add(makeNote({ box: "payroll", policy: policyHash(taxPolicy) }, taxPolicy), taxPolicy);
    const spec: SpendSpec = {
      ...baseSpend(world, input),
      outputs: [
        { note: makeNote({ box: "payroll", amount: input.note.amount, flags: FLAG_RELEASED, lockUntil: NOW, policy: input.note.policy }) },
        { note: makeNote({ amount: 0n, ownerPk: 5n }) },
      ],
    };
    await expect(run(spec)).rejects.toThrow();
  });

  it("allows setting the released flag with a lock of now + releaseDelay", async () => {
    const world = new World();
    const input = world.add(makeNote({ box: "payroll", policy: policyHash(taxPolicy) }, taxPolicy), taxPolicy);
    const spec: SpendSpec = {
      ...baseSpend(world, input),
      outputs: [
        { note: makeNote({ box: "payroll", amount: input.note.amount, flags: FLAG_RELEASED, lockUntil: NOW + 2n * DAY, policy: input.note.policy }) },
        { note: makeNote({ amount: 0n, ownerPk: 5n }) },
      ],
    };
    await expect(run(spec)).resolves.toBeDefined();
  });

  it("rejects changing the policy hash of the box without waiting", async () => {
    const world = new World();
    const input = world.add(makeNote({ box: "payroll", policy: policyHash(taxPolicy) }, taxPolicy), taxPolicy);
    const looser = policyHash(FREE_POLICY);
    const spec: SpendSpec = {
      ...baseSpend(world, input),
      outputs: [
        { note: makeNote({ box: "payroll", amount: input.note.amount, policy: looser, lockUntil: NOW + 2n * DAY - 1n }) },
        { note: makeNote({ amount: 0n, ownerPk: 5n }) },
      ],
    };
    await expect(run(spec)).rejects.toThrow();
  });

  it("with no release delay a reissue needs lockUntil of at least now, which expires at once", async () => {
    const world = new World();
    const input = world.add(makeNote({ box: "payroll" }));
    const reissue = (lockUntil: bigint): SpendSpec => ({
      ...baseSpend(world, input),
      outputs: [
        { note: makeNote({ box: "payroll", amount: input.note.amount, flags: FLAG_RELEASED, lockUntil }) },
        { note: makeNote({ amount: 0n, ownerPk: 5n }) },
      ],
    });
    await expect(run(reissue(NOW))).resolves.toBeDefined();
    await expect(run(reissue(NOW - 1n))).rejects.toThrow();
  });
});
