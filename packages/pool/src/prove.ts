import { readFileSync } from "node:fs";
import { Barretenberg, UltraHonkBackend } from "@aztec/bb.js";
import { type CompiledCircuit, type InputMap, Noir } from "@noir-lang/noir_js";

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
