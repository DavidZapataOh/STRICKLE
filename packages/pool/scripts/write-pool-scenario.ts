import { mkdirSync, writeFileSync } from "node:fs";
import { type Address, type Hex, keccak256, toBytes } from "viem";
import { privateKeyToAddress } from "viem/accounts";
import { closeProver, proveShield, proveSpend } from "../src/prove.ts";
import { ASSET_ID } from "../src/constants.ts";
import { PoolLedger } from "../src/ledger.ts";
import { MerkleTree } from "../src/merkle.ts";
import { type Note, noteCommitment } from "../src/note.ts";
import { FREE_POLICY, type Policy, policyHash } from "../src/policy.ts";
import { addressToField, ciphertextHash, shieldLabel } from "../src/pool-client.ts";
import { type InputSpec, type SpendSpec, deriveOutputNotes, recipientLeaf, withDummies } from "../src/witness.ts";
import { generateViewKey, deriveOwnerViewKey } from "../src/crypto/keys.ts";
import { type OutputPlaintext, sealEnvelope } from "../src/crypto/envelope.ts";
import { ViewKeyRing } from "../src/crypto/keyring.ts";
import { SK, freshSalt, user } from "../tests/circuits/fixture.ts";

const SCENARIO_NOW = 1_900_000_000n;
const USDC = 1_000_000n;

const named = (name: string): Address => privateKeyToAddress(keccak256(toBytes(name)));
const alice = named("alice");
const bob = named("bob");
const carol = named("carol");

const ledger = new PoolLedger();
const allowlist = new MerkleTree(10);
allowlist.insert(recipientLeaf(addressToField(bob)));

const labelSet = new MerkleTree(20);
const payrollPolicy: Policy = { ...FREE_POLICY, restricted: true, allowlistRoot: allowlist.root };

const note = (overrides: Partial<Note>, policy: Policy): Note => ({
  amount: 0n,
  ownerPk: user.pk,
  policy: policyHash(policy),
  label: 0n,
  box: "operating",
  asset: "USDC",
  flags: 0,
  lockUntil: 0n,
  salt: freshSalt(),
  ...overrides,
});

const ring = new ViewKeyRing(deriveOwnerViewKey(SK));
ring.setAccountant(generateViewKey().publicKey);

const seal = (notes: Note[], policies: [Policy, Policy]) =>
  sealEnvelope(notes.map((n, j): OutputPlaintext | null => (n.amount > 0n ? { note: n, policy: policies[j] as Policy, viewers: ring.viewers() } : null)) as [OutputPlaintext | null, OutputPlaintext | null]);

interface SpendOutput {
  kind: "spend";
  name: string;
  proof: Hex;
  ciphertext: Hex;
  inputs: Record<string, unknown>;
}

async function spendStep(
  name: string,
  spec: Omit<SpendSpec, "tree" | "signer" | "now" | "ciphertextHash">,
  policies: [Policy, Policy],
): Promise<{ step: SpendOutput; index: number; notes: Note[] }> {
  const base = withDummies({ ...spec, tree: ledger.tree, signer: { kind: "user", sk: SK }, now: SCENARIO_NOW });
  const ciphertext = seal(deriveOutputNotes(base).notes, policies);
  const full: SpendSpec = { ...base, ciphertextHash: ciphertextHash(ciphertext) };
  const { proof, publicInputs, outputNotes } = await proveSpend(full);
  const [root, n0, n1, c0, c1, publicAmount, recipient, asset, timestamp, , associationRoot, enc0, enc1] = publicInputs.map(String);
  const index = ledger.append(BigInt(c0 as string), BigInt(c1 as string));
  return {
    index,
    notes: outputNotes,
    step: {
      kind: "spend",
      name,
      proof,
      ciphertext,
      inputs: { root, nullifiers: [n0, n1], commitments: [c0, c1], publicAmount, recipient, asset, timestamp, associationRoot, enc: [enc0, enc1] },
    },
  };
}

const label = shieldLabel(alice, 0n);
labelSet.insert(label);
const n0 = note({ amount: 1_000n * USDC, label }, FREE_POLICY);
const shieldProof = await proveShield(n0, label);
const shieldIndex = ledger.append(noteCommitment(n0), 0n);
const shieldCiphertext = seal([n0, { ...n0, amount: 0n }], [FREE_POLICY, FREE_POLICY]);

const inputN0: InputSpec = { note: n0, policy: FREE_POLICY, leafIndex: shieldIndex };
const n1 = note({ amount: 600n * USDC, box: "payroll", label }, payrollPolicy);
const n2 = note({ amount: 400n * USDC, label }, FREE_POLICY);
const split = await spendStep("split", { inputs: [inputN0, null], outputs: [{ note: n1 }, { note: n2 }] }, [payrollPolicy, FREE_POLICY]);

const inputN1: InputSpec = { note: split.notes[0] as Note, policy: payrollPolicy, leafIndex: split.index };
const n3 = note({ amount: 350n * USDC, box: "payroll", label }, payrollPolicy);
const payBob = await spendStep(
  "payBob",
  {
    inputs: [inputN1, null],
    outputs: [{ note: n3 }, { note: note({ ownerPk: 5n }, FREE_POLICY) }],
    publicAmount: 250n * USDC,
    recipient: addressToField(bob),
    allowlist: { tree: allowlist, index: 0 },
  },
  [payrollPolicy, FREE_POLICY],
);

const inputN2: InputSpec = { note: split.notes[1] as Note, policy: FREE_POLICY, leafIndex: split.index + 1 };
const n4 = note({ amount: 300n * USDC, label }, FREE_POLICY);
const payCarol = await spendStep(
  "payCarol",
  {
    inputs: [inputN2, null],
    outputs: [{ note: n4 }, { note: note({ ownerPk: 5n }, FREE_POLICY) }],
    publicAmount: 100n * USDC,
    recipient: addressToField(carol),
    association: { tree: labelSet, index: 0 },
  },
  [FREE_POLICY, FREE_POLICY],
);

const label2 = shieldLabel(alice, 1n);
const n5 = note({ amount: 500n * USDC, label: label2 }, FREE_POLICY);
const secondShield = await proveShield(n5, label2);

const scenario = {
  now: SCENARIO_NOW.toString(),
  depositor: alice,
  bob,
  carol,
  asset: ASSET_ID.USDC,
  shield: {
    amount: (1_000n * USDC).toString(),
    commitment: noteCommitment(n0).toString(),
    proof: shieldProof.proof,
    ciphertext: shieldCiphertext,
  },
  secondShield: {
    amount: (500n * USDC).toString(),
    commitment: noteCommitment(n5).toString(),
    proof: secondShield.proof,
    ciphertext: seal([n5, { ...n5, amount: 0n }], [FREE_POLICY, FREE_POLICY]),
  },
  spends: [split.step, payBob.step, payCarol.step],
  expected: { afterSplit: (1_000n * USDC).toString(), afterBob: (750n * USDC).toString(), afterCarol: (650n * USDC).toString() },
};

const outDir = new URL("../../../contracts/test/fixtures/pool/", import.meta.url);
mkdirSync(outDir, { recursive: true });
writeFileSync(new URL("scenario.json", outDir), `${JSON.stringify(scenario, null, 2)}\n`);
console.log(`scenario written: ${scenario.spends.length} spends, final tree size ${ledger.tree.size}`);
await closeProver();
