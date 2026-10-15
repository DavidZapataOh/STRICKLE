import { afterAll, describe, expect, it } from "vitest";
import { AGENT_ACTION, FLAG_RELEASED } from "../../src/constants.ts";
import { agentKeyHash } from "../../src/keys.ts";
import { MerkleTree } from "../../src/merkle.ts";
import { closeProver, executeCircuit } from "../../src/prove.ts";
import { FREE_POLICY, type Policy, policyHash, templateLeaf } from "../../src/policy.ts";
import { type SpendSpec, buildSpendInputs, recipientLeaf } from "../../src/witness.ts";
import { AK, NOW, World, baseSpend, freshSalt, makeNote, user } from "./fixture.ts";

afterAll(closeProver);

const run = (spec: SpendSpec) => executeCircuit("spend", buildSpendInputs(spec).inputs);
const agent = { kind: "agent" as const, ak: AK, nk: user.nk, authHash: user.authHash };

const PAYEE = 0xabcdn;
const salaryPolicy: Policy = { ...FREE_POLICY, floor: 100_000n };

function templates(): { tree: MerkleTree; salary: number; profit: number } {
  const tree = new MerkleTree(3);
  const salary = tree.insert(templateLeaf("salary", policyHash(salaryPolicy)));
  const profit = tree.insert(templateLeaf("profit", policyHash(FREE_POLICY)));
  return { tree, salary, profit };
}

function agentWorld(overrides: Partial<Policy> = {}) {
  const world = new World();
  const t = templates();
  const allowlist = new MerkleTree(10);
  allowlist.insert(recipientLeaf(PAYEE));
  const policy: Policy = {
    ...FREE_POLICY,
    agentKeyHash: agentKeyHash(AK),
    agentActions: AGENT_ACTION.SPLIT | AGENT_ACTION.PAY_ALLOWLISTED,
    agentCap: 600_000n,
    allowlistRoot: allowlist.root,
    templateRoot: t.tree.root,
    ...overrides,
  };
  const input = world.add(makeNote({ box: "operating", policy: policyHash(policy) }, policy), policy);
  return { world, input, policy, t, allowlist };
}

function split(w: ReturnType<typeof agentWorld>, salaryAmount = 400_000n): SpendSpec {
  return {
    ...baseSpend(w.world, w.input),
    signer: agent,
    outputs: [
      { note: makeNote({ box: "salary", amount: salaryAmount, policy: policyHash(salaryPolicy) }), template: { tree: w.t.tree, index: w.t.salary } },
      { note: makeNote({ box: "operating", amount: w.input.note.amount - salaryAmount, policy: w.input.note.policy }) },
    ],
  };
}

function payment(w: ReturnType<typeof agentWorld>, amount = 300_000n, recipient = PAYEE): SpendSpec {
  return {
    ...baseSpend(w.world, w.input),
    signer: agent,
    publicAmount: amount,
    recipient,
    allowlist: { tree: w.allowlist, index: 0 },
    outputs: [
      { note: makeNote({ box: "operating", amount: w.input.note.amount - amount, policy: w.input.note.policy }) },
      { note: makeNote({ amount: 0n, ownerPk: 5n }) },
    ],
  };
}

describe("agent: allowed actions", () => {
  it("splits a note into approved destinations", async () => {
    await expect(run(split(agentWorld()))).resolves.toBeDefined();
  });

  it("pays an approved recipient within its cap", async () => {
    await expect(run(payment(agentWorld()))).resolves.toBeDefined();
  });

  it("consolidates two notes of its own box (a redeem) without any special right", async () => {
    const w = agentWorld({ agentActions: 0 });
    const second = w.world.add(makeNote({ box: "operating", policy: w.input.note.policy }, w.policy), w.policy);
    const spec: SpendSpec = {
      ...baseSpend(w.world, w.input),
      signer: agent,
      inputs: [w.input, second],
      outputs: [{ note: makeNote({ box: "operating", amount: 2_000_000n, policy: w.input.note.policy }) }, { note: makeNote({ amount: 0n, ownerPk: 5n }) }],
    };
    await expect(run(spec)).resolves.toBeDefined();
  });
});

describe("agent: limits", () => {
  it("rejects an agent key that does not match the policy", async () => {
    const w = agentWorld();
    await expect(run({ ...split(w), signer: { ...agent, ak: AK + 1n } })).rejects.toThrow();
  });

  it("rejects a note whose policy has no agent at all", async () => {
    const w = agentWorld({ agentKeyHash: 0n });
    await expect(run(split(w))).rejects.toThrow();
  });

  it("rejects a forged nullifier key: the owner id binds nk", async () => {
    const w = agentWorld();
    await expect(run({ ...split(w), signer: { ...agent, nk: user.nk + 1n } })).rejects.toThrow();
  });

  it("rejects a payment above the cap, and one that together with moves exceeds it", async () => {
    await expect(run(payment(agentWorld(), 600_001n))).rejects.toThrow();
    const w = agentWorld();
    const spec = split(w, 600_001n);
    await expect(run(spec)).rejects.toThrow();
  });

  it("rejects a payment to a recipient outside the allowlist", async () => {
    await expect(run(payment(agentWorld(), 300_000n, 0xdeadn))).rejects.toThrow();
  });

  it("rejects actions the policy does not grant", async () => {
    await expect(run(payment(agentWorld({ agentActions: AGENT_ACTION.SPLIT })))).rejects.toThrow();
    await expect(run(split(agentWorld({ agentActions: AGENT_ACTION.PAY_ALLOWLISTED })))).rejects.toThrow();
  });

  it("rejects a split to a destination that is not in the template tree", async () => {
    const w = agentWorld();
    const spec = split(w);
    spec.outputs[0] = { note: makeNote({ box: "salary", amount: 400_000n, policy: policyHash(FREE_POLICY) }), template: { tree: w.t.tree, index: w.t.salary } };
    await expect(run(spec)).rejects.toThrow();
  });

  it("rejects a split into a box with a more permissive policy than the template", async () => {
    const w = agentWorld();
    const spec = split(w);
    const permissive: Policy = { ...FREE_POLICY, agentKeyHash: agentKeyHash(AK), agentActions: 15, agentCap: 2n ** 63n };
    spec.outputs[0] = { note: makeNote({ box: "salary", amount: 400_000n, policy: policyHash(permissive) }), template: { tree: w.t.tree, index: w.t.salary } };
    await expect(run(spec)).rejects.toThrow();
  });

  it("rejects sending value to another owner", async () => {
    const w = agentWorld();
    const spec = split(w);
    spec.outputs[0] = { note: makeNote({ box: "operating", amount: 400_000n, ownerPk: 99n, policy: w.input.note.policy }) };
    await expect(run(spec)).rejects.toThrow();
  });

  it("rejects an agent changing a policy or setting the released flag", async () => {
    const w = agentWorld();
    const spec: SpendSpec = {
      ...baseSpend(w.world, w.input),
      signer: agent,
      outputs: [
        { note: makeNote({ box: "operating", amount: w.input.note.amount, flags: FLAG_RELEASED, lockUntil: NOW + 10n ** 9n, policy: w.input.note.policy }) },
        { note: makeNote({ amount: 0n, ownerPk: 5n }) },
      ],
    };
    await expect(run(spec)).rejects.toThrow();
  });

  it("does not let an agent use a released note to skip the floor", async () => {
    const w = agentWorld({ floor: 900_000n });
    const released = w.world.add(makeNote({ box: "operating", flags: FLAG_RELEASED, policy: policyHash({ ...w.policy }) }, w.policy), w.policy);
    const spec = payment({ ...w, input: released }, 500_000n);
    await expect(run(spec)).rejects.toThrow();
  });

  it("keeps the user able to act on the same note without the agent's limits", async () => {
    const w = agentWorld();
    const spec = { ...payment(w, 900_000n, 0xdeadn), signer: { kind: "user" as const, sk: user.sk } };
    await expect(run(spec)).resolves.toBeDefined();
    void freshSalt;
  });
});

describe("agent: locks", () => {
  function locked(lockOut: bigint, signer = agent): SpendSpec {
    const w = agentWorld({ releaseDelay: 172_800 });
    const input = w.world.add(makeNote({ box: "operating", lockUntil: NOW + 30n * 86_400n, policy: policyHash(w.policy) }, w.policy), w.policy);
    return {
      ...baseSpend(w.world, input),
      signer,
      outputs: [
        { note: makeNote({ box: "operating", amount: input.note.amount, lockUntil: lockOut, policy: input.note.policy }) },
        { note: makeNote({ amount: 0n, ownerPk: 5n }) },
      ],
    };
  }

  it("lets the agent keep a lock as it is", async () => {
    await expect(run(locked(NOW + 30n * 86_400n))).resolves.toBeDefined();
  });

  it("rejects the agent shortening a lock that the owner could shorten", async () => {
    await expect(run(locked(NOW + 2n * 86_400n))).rejects.toThrow();
    await expect(run(locked(NOW + 2n * 86_400n, { kind: "user", sk: user.sk } as never))).resolves.toBeDefined();
  });
});
