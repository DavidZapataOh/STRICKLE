import { MerkleTree } from "@strickle/pool/merkle";
import { ownerPk } from "@strickle/pool/keys";
import { type Note, noteCommitment } from "@strickle/pool/note";
import { FREE_POLICY, policyHash } from "@strickle/pool/policy";
import { buildSpendInputs } from "@strickle/pool/witness";
import { createProver } from "@strickle/prover";
import { hostedCrs, urlCircuitLoader } from "@strickle/prover/browser";

declare global {
  interface Window {
    benchResult?: unknown;
  }
}

const params = new URL(location.href).searchParams;
const threads = Number(params.get("threads") ?? "1");
const crs = params.get("crs");
if (crs) hostedCrs(crs);

const SK = 123456789012345678901234567890n;
const note = (overrides: Partial<Note>): Note => ({
  amount: 1_000_000n,
  ownerPk: ownerPk(SK),
  policy: policyHash(FREE_POLICY),
  label: 0n,
  box: "operating",
  asset: "USDC",
  flags: 0,
  lockUntil: 0n,
  salt: 1_000_001n,
  ...overrides,
});

const mark = () => performance.now();
const t0 = mark();
const tree = new MerkleTree();
const input = note({});
const index = tree.insertPair(noteCommitment(input), noteCommitment(note({ amount: 0n, ownerPk: 1n, salt: 2n }))).index;
const built = buildSpendInputs({
  tree,
  inputs: [{ note: input, policy: FREE_POLICY, leafIndex: index }, null],
  outputs: [{ note: note({ amount: 600_000n, box: "salary" }) }, { note: note({ amount: 400_000n, box: "profit" }) }],
  signer: { kind: "user", sk: SK },
  now: 1_800_000_000n,
});
const t1 = mark();

const prover = createProver({ loadCircuit: urlCircuitLoader("/circuits"), backend: { threads } });
await prover.prepare("spend");
const t2 = mark();
const { witness } = await prover.execute("spend", built.inputs);
const t3 = mark();
const proof = await prover.prove("spend", witness);
const t4 = mark();
const ok = await prover.verify("spend", proof);
const t5 = mark();

window.benchResult = {
  crossOriginIsolated: self.crossOriginIsolated,
  cores: navigator.hardwareConcurrency,
  threads,
  witnessMs: t1 - t0,
  prepareMs: t2 - t1,
  executeMs: t3 - t2,
  proveMs: t4 - t3,
  verifyMs: t5 - t4,
  totalMs: t4 - t0,
  ok,
  proof: `0x${Array.from(proof.proof, (b) => b.toString(16).padStart(2, "0")).join("")}`,
  publicInputs: proof.publicInputs,
  expectedPublicInputs: built.publicInputs.map((v) => `0x${v.toString(16).padStart(64, "0")}`),
};
