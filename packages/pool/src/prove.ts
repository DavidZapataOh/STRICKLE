import type { ProofData } from "@aztec/bb.js";
import type { InputMap } from "@noir-lang/noir_js";
import { createProver } from "@strickle/prover";
import { nodeCircuitLoader } from "@strickle/prover/node";
import { type Hex, bytesToHex } from "viem";
import type { Note } from "./note.ts";
import { type SpendSpec, buildShieldInputs, buildSpendInputs } from "./witness.ts";

export type CircuitName = "shield" | "spend";

const prover = createProver({
  loadCircuit: nodeCircuitLoader(new URL("../../../circuits/target/", import.meta.url)),
  backend: { threads: 1 },
});

export const executeCircuit = (name: CircuitName, inputs: InputMap) => prover.execute(name, inputs);
export const proveCircuit = (name: CircuitName, witness: Uint8Array) => prover.prove(name, witness);
export const verifyCircuit = (name: CircuitName, proof: ProofData) => prover.verify(name, proof);
export const closeProver = () => prover.destroy();

export interface ProvedTransaction {
  proof: Hex;
  publicInputs: bigint[];
}

export interface ProvedSpend extends ProvedTransaction {
  /** The notes actually committed: self outputs carry the salt derived by the circuit. */
  outputNotes: Note[];
}

async function proveAndCheck(name: CircuitName, inputs: InputMap, publicInputs: bigint[]): Promise<ProvedTransaction> {
  const { witness } = await executeCircuit(name, inputs);
  const proof = await proveCircuit(name, witness);
  if (!(await verifyCircuit(name, proof))) throw new Error(`${name}: the fresh proof does not verify`);
  if (proof.publicInputs.map(BigInt).join() !== publicInputs.join()) throw new Error(`${name}: public inputs differ from the witness`);
  return { proof: bytesToHex(proof.proof), publicInputs };
}

export function proveShield(note: Note, label: bigint): Promise<ProvedTransaction> {
  const built = buildShieldInputs({ note, label });
  return proveAndCheck("shield", built.inputs, built.publicInputs);
}

export async function proveSpend(spec: SpendSpec): Promise<ProvedSpend> {
  const built = buildSpendInputs(spec);
  return { ...(await proveAndCheck("spend", built.inputs, built.publicInputs)), outputNotes: built.outputNotes };
}
