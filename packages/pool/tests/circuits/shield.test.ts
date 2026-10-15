import { afterAll, describe, expect, it } from "vitest";
import { closeProver, executeCircuit } from "../../src/prove.ts";
import { buildShieldInputs } from "../../src/witness.ts";
import { makeNote } from "./fixture.ts";

afterAll(closeProver);

describe("shield circuit", () => {
  it("accepts a note that matches the deposit", async () => {
    const note = makeNote({ amount: 5_000_000n, label: 777n });
    await expect(executeCircuit("shield", buildShieldInputs({ note }).inputs)).resolves.toBeDefined();
  });

  it("rejects a commitment of another note", async () => {
    const note = makeNote({ amount: 5_000_000n, label: 777n });
    const inputs = buildShieldInputs({ note }).inputs;
    const other = buildShieldInputs({ note: makeNote({ amount: 5_000_000n, label: 777n }) }).inputs;
    await expect(executeCircuit("shield", { ...inputs, commitment: other.commitment })).rejects.toThrow();
  });

  it("rejects a note worth more than the deposited amount", async () => {
    const note = makeNote({ amount: 5_000_001n, label: 777n });
    const inputs = buildShieldInputs({ note }).inputs;
    await expect(executeCircuit("shield", { ...inputs, amount: "5000000" })).rejects.toThrow();
  });

  it("rejects another asset, another label and a zero amount", async () => {
    const note = makeNote({ amount: 5_000_000n, label: 777n });
    const inputs = buildShieldInputs({ note }).inputs;
    await expect(executeCircuit("shield", { ...inputs, asset: 2 })).rejects.toThrow();
    await expect(executeCircuit("shield", { ...inputs, label: "0x01" })).rejects.toThrow();
    const empty = makeNote({ amount: 0n, label: 777n });
    await expect(executeCircuit("shield", buildShieldInputs({ note: empty }).inputs)).rejects.toThrow();
  });

  it("rejects out-of-range box and flags inside the note", async () => {
    const note = makeNote({ amount: 5_000_000n, label: 777n });
    const base = buildShieldInputs({ note });
    const withNote = (patch: Record<string, number>) => ({ ...base.inputs, note: { ...(base.inputs.note as object), ...patch } });
    await expect(executeCircuit("shield", withNote({ box_id: 0 }))).rejects.toThrow();
    await expect(executeCircuit("shield", withNote({ box_id: 7 }))).rejects.toThrow();
    await expect(executeCircuit("shield", withNote({ flags: 2 }))).rejects.toThrow();
  });
});
