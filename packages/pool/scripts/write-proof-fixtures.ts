import { mkdirSync, writeFileSync } from "node:fs";
import { closeProver, executeCircuit, proveCircuit, verifyCircuit } from "../src/prove.ts";
import { buildShieldInputs, buildSpendInputs } from "../src/witness.ts";
import { World, baseSpend, makeNote } from "../tests/circuits/fixture.ts";

const outDir = new URL("../../../contracts/test/fixtures/proofs/", import.meta.url);
mkdirSync(outDir, { recursive: true });

async function write(name: "shield" | "spend", inputs: Parameters<typeof executeCircuit>[1]): Promise<void> {
  const { witness } = await executeCircuit(name, inputs);
  const proof = await proveCircuit(name, witness);
  if (!(await verifyCircuit(name, proof))) throw new Error(`${name}: the fresh proof does not verify`);
  writeFileSync(new URL(`${name}.proof`, outDir), proof.proof);
  writeFileSync(new URL(`${name}.inputs`, outDir), Buffer.concat(proof.publicInputs.map((word) => Buffer.from(word.replace(/^0x/, ""), "hex"))));
  console.log(`${name}: ${proof.proof.length} byte proof, ${proof.publicInputs.length} public inputs`);
}

await write("shield", buildShieldInputs({ note: makeNote({ amount: 5_000_000n, label: 9n }) }).inputs);
await write("spend", buildSpendInputs(baseSpend(new World())).inputs);
await closeProver();
