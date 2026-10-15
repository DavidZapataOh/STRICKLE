import { readFileSync } from "node:fs";
import { Barretenberg, UltraHonkBackend } from "@aztec/bb.js";
import { type CompiledCircuit, type InputMap, Noir } from "@noir-lang/noir_js";
import { type Hex, bytesToHex } from "viem";
import type { Note } from "./note.ts";
import { type SpendSpec, buildShieldInputs, buildSpendInputs } from "./witness.ts";

export type CircuitName = "shield" | "spend";

export function loadCircuit(name: CircuitName): CompiledCircuit {
  const file = new URL(`../../../circuits/target/${name}.json`, import.meta.url);
  return JSON.parse(readFileSync(file, "utf8")) as CompiledCircuit;
}

export async function executeCircuit(name: CircuitName, inputs: InputMap): Promise<{ witness: Uint8Array }> {
  const { witness } = await new Noir(loadCircuit(name)).execute(inputs);
  return { witness };
}

let api: Barretenberg | undefined;

async function backend(name: CircuitName): Promise<UltraHonkBackend> {
  api ??= await Barretenberg.new({ threads: 1 });
  return new UltraHonkBackend(loadCircuit(name).bytecode, api);
}

export async function proveCircuit(name: CircuitName, witness: Uint8Array) {
  return (await backend(name)).generateProof(witness, { verifierTarget: "evm" });
}

export async function verifyCircuit(name: CircuitName, proofData: Awaited<ReturnType<typeof proveCircuit>>): Promise<boolean> {
  return (await backend(name)).verifyProof(proofData, { verifierTarget: "evm" });
}

export async function closeProver(): Promise<void> {
  await api?.destroy();
  api = undefined;
}

export interface ProvedTransaction {
  proof: Hex;
  publicInputs: bigint[];
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

export function proveSpend(spec: SpendSpec): Promise<ProvedTransaction> {
  const built = buildSpendInputs(spec);
  return proveAndCheck("spend", built.inputs, built.publicInputs);
}
