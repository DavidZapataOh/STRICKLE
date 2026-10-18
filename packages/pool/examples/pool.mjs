import { FREE_POLICY, noteCommitment, policyHash } from "@strickle/pool";
import { closeProver, executeCircuit, proveCircuit, verifyCircuit } from "@strickle/pool/prove";
import { buildShieldInputs } from "@strickle/pool/witness";

const note = {
  amount: 5_000_000n,
  ownerPk: 42n,
  policy: policyHash(FREE_POLICY),
  label: 9n,
  box: "operating",
  asset: "USDC",
  flags: 0,
  lockUntil: 0n,
  delayFloor: 0,
  salt: 1001n,
};
try {
  const built = buildShieldInputs({ note });
  const { witness } = await executeCircuit("shield", built.inputs);
  const proof = await proveCircuit("shield", witness);
  const valid = await verifyCircuit("shield", proof);
  const tampered = await verifyCircuit("shield", { ...proof, publicInputs: [...proof.publicInputs.slice(0, 1), `0x${"01".padStart(64, "0")}`, ...proof.publicInputs.slice(2)] });
  console.log(`commitment ${noteCommitment(note).toString(16).slice(0, 16)}…, proof verifies: ${valid}, altered public input verifies: ${tampered}`);
  if (!valid || tampered) throw new Error("unexpected proof result");
  console.log("ok");
} finally {
  await closeProver();
}
