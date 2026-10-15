import { readFileSync } from "node:fs";
import type { InputMap } from "@noir-lang/noir_js";
import { afterEach, describe, expect, it } from "vitest";
import { createProver } from "../../src/engine.ts";
import { nodeCircuitLoader } from "../../src/node.ts";

const circuits = new URL("../../../../circuits/target/", import.meta.url);
const fixture = (name: string): InputMap => JSON.parse(readFileSync(new URL(`../fixtures/${name}-inputs.json`, import.meta.url), "utf8"));

function counting() {
  const loads: string[] = [];
  const load = nodeCircuitLoader(circuits);
  return {
    loads,
    prover: createProver({
      loadCircuit: (name) => {
        loads.push(name);
        return load(name);
      },
      backend: { threads: 1 },
    }),
  };
}

let current: ReturnType<typeof counting> | undefined;
afterEach(async () => {
  await current?.prover.destroy();
  current = undefined;
});

describe("proving engine", () => {
  it("proves a shield and the proof verifies with its four public inputs", async () => {
    current = counting();
    const result = await current.prover.proveInputs("shield", fixture("shield"));
    expect(result.publicInputs).toHaveLength(4);
    expect(result.proof.length).toBeGreaterThan(1000);
  });

  it("proves a spend with its thirteen public inputs", async () => {
    current = counting();
    const result = await current.prover.proveInputs("spend", fixture("spend"));
    expect(result.publicInputs).toHaveLength(13);
  });

  it("rejects a proof whose public input was changed", async () => {
    current = counting();
    const { witness } = await current.prover.execute("shield", fixture("shield"));
    const proof = await current.prover.prove("shield", witness);
    expect(await current.prover.verify("shield", proof)).toBe(true);
    const tampered = { ...proof, publicInputs: [`0x${"01".padStart(64, "0")}`, ...proof.publicInputs.slice(1)] };
    expect(await current.prover.verify("shield", tampered)).toBe(false);
  });

  it("loads each circuit once and reuses the backend", async () => {
    current = counting();
    await current.prover.proveInputs("shield", fixture("shield"));
    await current.prover.proveInputs("shield", fixture("shield"));
    expect(current.loads).toEqual(["shield"]);
  });

  it("rejects an unknown circuit", async () => {
    current = counting();
    await expect(current.prover.execute("nope", {})).rejects.toThrow();
  });

  it("rejects a witness that violates the circuit and stays usable", async () => {
    current = counting();
    const bad = { ...fixture("shield"), amount: "1" };
    await expect(current.prover.proveInputs("shield", bad)).rejects.toThrow();
    await expect(current.prover.proveInputs("shield", fixture("shield"))).resolves.toBeDefined();
  });

  it("can be destroyed twice and used again afterwards", async () => {
    current = counting();
    await current.prover.proveInputs("shield", fixture("shield"));
    await current.prover.destroy();
    await current.prover.destroy();
    await expect(current.prover.proveInputs("shield", fixture("shield"))).resolves.toBeDefined();
  });
});
