import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createProver } from "@strickle/prover";
import { nodeCircuitLoader } from "@strickle/prover/node";
import { bytesToHex } from "viem";
import { buildShieldInputs, buildSpendInputs } from "./witness.js";
const packaged = new URL("../circuits/", import.meta.url);
/** The circuits ship inside the published package; in the repository they are the compiled workspace output. */
const circuits = existsSync(fileURLToPath(packaged)) ? packaged : new URL("../../../circuits/target/", import.meta.url);
const prover = createProver({
    loadCircuit: nodeCircuitLoader(circuits),
    backend: { threads: 1 },
});
export const executeCircuit = (name, inputs) => prover.execute(name, inputs);
export const proveCircuit = (name, witness) => prover.prove(name, witness);
export const verifyCircuit = (name, proof) => prover.verify(name, proof);
export const closeProver = () => prover.destroy();
async function proveAndCheck(name, inputs, publicInputs) {
    const { witness } = await executeCircuit(name, inputs);
    const proof = await proveCircuit(name, witness);
    if (!(await verifyCircuit(name, proof)))
        throw new Error(`${name}: the fresh proof does not verify`);
    if (proof.publicInputs.map(BigInt).join() !== publicInputs.join())
        throw new Error(`${name}: public inputs differ from the witness`);
    return { proof: bytesToHex(proof.proof), publicInputs };
}
export function proveShield(note, label) {
    const built = buildShieldInputs({ note, label });
    return proveAndCheck("shield", built.inputs, built.publicInputs);
}
export async function proveSpend(spec) {
    const built = buildSpendInputs(spec);
    return { ...(await proveAndCheck("spend", built.inputs, built.publicInputs)), outputNotes: built.outputNotes };
}
