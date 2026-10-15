// packages/pool/tests/spec-wire.test.ts
import { describe, expect, it } from "vitest";
import { AGENT_ACTION } from "../src/constants.ts";
import { agentKeyHash } from "../src/keys.ts";
import { MerkleTree } from "../src/merkle.ts";
import { FREE_POLICY, type Policy, policyHash } from "../src/policy.ts";
import { addressToField } from "../src/pool-client.ts";
import { type Note, noteCommitment } from "../src/note.ts";
import { type LiteSpec, specFromWire, specToWire } from "../src/spec-wire.ts";
import { buildSpendInputs, recipientLeaf } from "../src/witness.ts";

const PAYEE = "0x00000000000000000000000000000000000000b2";
const AK = 99n;
const allowlist = new MerkleTree(10);
allowlist.insert(recipientLeaf(addressToField(PAYEE)));
const policy: Policy = { ...FREE_POLICY, agentKeyHash: agentKeyHash(AK), agentActions: AGENT_ACTION.PAY_ALLOWLISTED, agentCap: 600_000n, allowlistRoot: allowlist.root };
const note = (amount: bigint, salt: bigint): Note => ({ amount, ownerPk: 7n, policy: policyHash(policy), label: 1n, box: "payroll", asset: "USDC", flags: 0, lockUntil: 0n, delayFloor: 0, salt });

const tree = new MerkleTree();
const input = note(1_000_000n, 3n);
tree.insertPair(noteCommitment(input), 0n);

const lite: LiteSpec = {
  inputs: [{ note: input, policy, leafIndex: 0 }, null],
  outputs: [{ note: note(700_000n, 0n) }, { note: { ...note(0n, 9n), ownerPk: 5n, label: 0n } }],
  signer: { kind: "agent", ak: AK, nk: 2n, authHash: 3n },
  publicAmount: 300_000n,
  recipient: addressToField(PAYEE),
  asset: "USDC",
  now: 1_800_000_000n,
  ciphertextHash: 123n,
  allowlist: { addresses: [PAYEE], index: 0 },
  dummyNk: [11n, 12n],
  dummySalt: [13n, 14n],
  enc: [21n, 22n],
};

describe("spec wire", () => {
  it("round-trips through JSON and yields the same circuit inputs as the full spec", () => {
    const wire = JSON.parse(JSON.stringify(specToWire(lite)));
    const rebuilt = specFromWire(wire, tree);
    const full = { ...lite, tree, allowlist: { tree: allowlist, index: 0 } };
    expect(buildSpendInputs(rebuilt).publicInputs).toEqual(buildSpendInputs(full as never).publicInputs);
  });

  it("carries only decimal strings for big numbers", () => {
    const text = JSON.stringify(specToWire(lite));
    expect(text).not.toMatch(/"amount":\d/);
    expect(JSON.parse(text).publicAmount).toBe("300000");
  });

  it.each([
    ["a missing signer", (w: Record<string, unknown>) => delete w.signer],
    ["a non-numeric amount", (w: Record<string, unknown>) => {
      const [first] = w.outputs as { note: { amount: string } }[];
      if (first) first.note.amount = "x";
    }],
    ["an allowlist address that is not an address", (w: Record<string, unknown>) => { (w.allowlist as { addresses: string[] }).addresses = ["nope"]; }],
    ["a user signer (the service only proves agent spends)", (w: Record<string, unknown>) => { w.signer = { kind: "user", sk: "1" }; }],
  ])("refuses %s", (_name, damage) => {
    const wire = JSON.parse(JSON.stringify(specToWire(lite)));
    damage(wire);
    expect(() => specFromWire(wire, tree)).toThrow();
  });
});
