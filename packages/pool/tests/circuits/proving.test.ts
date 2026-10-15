import { afterAll, describe, expect, it } from "vitest";
import { closeProver, executeCircuit, proveCircuit, proveShield, proveSpend, verifyCircuit } from "../../src/prove.ts";
import { buildShieldInputs, buildSpendInputs } from "../../src/witness.ts";
import { World, baseSpend, makeNote } from "./fixture.ts";

afterAll(closeProver);

const hex = (value: bigint) => `0x${value.toString(16).padStart(64, "0")}`;

describe("proofs", () => {
  it("proves and verifies a shield with its 4 public inputs", async () => {
    const built = buildShieldInputs({ note: makeNote({ amount: 5_000_000n, label: 9n }) });
    const { witness } = await executeCircuit("shield", built.inputs);
    const proof = await proveCircuit("shield", witness);
    expect(proof.publicInputs).toEqual(built.publicInputs.map(hex));
    expect(await verifyCircuit("shield", proof)).toBe(true);
  });

  it("proves and verifies a spend with its 13 public inputs and nothing secret in them", async () => {
    const world = new World();
    const spec = baseSpend(world);
    const built = buildSpendInputs(spec);
    const { witness } = await executeCircuit("spend", built.inputs);
    const proof = await proveCircuit("spend", witness);
    expect(proof.publicInputs).toHaveLength(13);
    expect(proof.publicInputs).toEqual(built.publicInputs.map(hex));
    expect(await verifyCircuit("spend", proof)).toBe(true);
  });

  it("a tampered public input does not verify", async () => {
    const world = new World();
    const built = buildSpendInputs(baseSpend(world));
    const { witness } = await executeCircuit("spend", built.inputs);
    const proof = await proveCircuit("spend", witness);
    const tampered = { ...proof, publicInputs: [...proof.publicInputs.slice(0, 5), hex(1n), ...proof.publicInputs.slice(6)] };
    expect(await verifyCircuit("spend", tampered)).toBe(false);
  });

  it("returns a ready-to-send proof and its public inputs for a shield and a spend", async () => {
    const note = makeNote({ amount: 5_000_000n, label: 9n });
    const shield = await proveShield(note, 9n);
    expect(shield.publicInputs).toHaveLength(4);
    expect(shield.proof).toMatch(/^0x[0-9a-f]+$/);
    const spend = await proveSpend(baseSpend(new World()));
    expect(spend.publicInputs).toHaveLength(13);
  });
});
