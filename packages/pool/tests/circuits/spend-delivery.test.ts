import type { InputMap } from "@noir-lang/noir_js";
import { afterAll, describe, expect, it } from "vitest";
import { DOMAIN } from "../../src/constants.ts";
import { deliveryKey, deliveryPad, deliverySalt, decryptDelivery, packDelivery, unpackDelivery } from "../../src/delivery.ts";
import { toHex32 } from "../../src/field.ts";
import { hash } from "../../src/poseidon.ts";
import { closeProver, executeCircuit } from "../../src/prove.ts";
import { type SpendSpec, buildSpendInputs } from "../../src/witness.ts";
import { World, baseSpend, makeNote, user } from "./fixture.ts";

afterAll(closeProver);

const run = (inputs: InputMap) => executeCircuit("spend", inputs);

describe("self delivery", () => {
  it("publishes one encrypted delivery per self output and the owner can read it back", () => {
    const world = new World();
    const built = buildSpendInputs(baseSpend(world));
    expect(built.publicInputs).toHaveLength(13);
    const nullifier0 = built.publicInputs[1] as number | bigint;
    const [enc0, enc1] = built.publicInputs.slice(11) as bigint[];
    for (const [j, enc] of [enc0, enc1].entries()) {
      const key = deliveryKey(user.nk, BigInt(nullifier0), j);
      const note = built.outputNotes[j];
      expect(note?.salt).toBe(deliverySalt(key));
      expect(unpackDelivery(decryptDelivery(enc as bigint, key))).toEqual({ amount: note?.amount, flags: note?.flags, lockUntil: note?.lockUntil, delayFloor: note?.delayFloor });
    }
  });

  it("is accepted by the circuit", async () => {
    await expect(run(buildSpendInputs(baseSpend(new World())).inputs)).resolves.toBeDefined();
  });

  it("fills the delivery slot of an output sent to another owner with a random value the circuit accepts", async () => {
    const world = new World();
    const spec = baseSpend(world);
    const input = spec.inputs[0]!;
    spec.outputs = [{ note: makeNote({ amount: 400_000n, box: "salary", policy: input.note.policy }) }, { note: makeNote({ amount: 600_000n, ownerPk: 99n, policy: input.note.policy }) }];
    const built = buildSpendInputs(spec);
    expect(built.publicInputs[12]).not.toBe(0n);
    await expect(run(built.inputs)).resolves.toBeDefined();
    await expect(run({ ...built.inputs, enc: [(built.inputs.enc as string[])[0] as string, "0x01"] })).resolves.toBeDefined();
  });

  it("rejects a self output with a wrong encrypted amount, flags or lock", async () => {
    const built = buildSpendInputs(baseSpend(new World()));
    const [enc0, enc1] = built.inputs.enc as string[];
    const bump = (hex: string) => toHex32(BigInt(hex) + 1n);
    await expect(run({ ...built.inputs, enc: [bump(enc0 as string), enc1 as string] })).rejects.toThrow();
    await expect(run({ ...built.inputs, enc: [enc0 as string, bump(enc1 as string)] })).rejects.toThrow();
  });

  it("rejects an output committed with a salt other than the derived one", async () => {
    const world = new World();
    const spec = baseSpend(world);
    const built = buildSpendInputs(spec);
    const outputs = built.inputs.outputs as { note: Record<string, string | number> }[];
    const note: Record<string, string | number> = { ...(outputs[0] as { note: Record<string, string | number> }).note, salt: "0x1234" };
    // keep the commitment consistent with the forged salt so only the delivery rule can reject it
    const meta = BigInt(note.box_id as number) + BigInt(note.asset as number) * 2n ** 8n + BigInt(note.flags as number) * 2n ** 16n + BigInt(note.lock_until as string) * 2n ** 32n;
    const commitment = hash([DOMAIN.NOTE, BigInt(note.amount as string), BigInt(note.owner_pk as string), BigInt(note.policy as string), BigInt(note.label as string), meta, 0x1234n]);
    const forged = { ...built.inputs, outputs: [{ ...outputs[0], note }, outputs[1]], commitments: [toHex32(commitment), (built.inputs.commitments as string[])[1] as string] };
    await expect(run(forged as InputMap)).rejects.toThrow();
  });

  it("does not tell an empty output from a kept one by its delivery value", () => {
    const world = new World();
    const input = world.add(makeNote({ amount: 1_000_000n }));
    const spec: SpendSpec = { ...baseSpend(world, input), outputs: [{ note: makeNote({ amount: 1_000_000n }) }, { note: makeNote({ amount: 0n, ownerPk: 5n }) }] };
    const built = buildSpendInputs(spec);
    expect(built.publicInputs[12]).not.toBe(0n);
  });

  it("uses fresh keys for the same owner in a second transaction", () => {
    const first = buildSpendInputs(baseSpend(new World()));
    const second = buildSpendInputs(baseSpend(new World()));
    expect(first.publicInputs[11]).not.toBe(second.publicInputs[11]);
    expect(deliveryPad(deliveryKey(user.nk, BigInt(first.publicInputs[1] as bigint), 0))).not.toBe(deliveryPad(deliveryKey(user.nk, BigInt(second.publicInputs[1] as bigint), 0)));
    expect(packDelivery({ amount: 1n, flags: 0, lockUntil: 0n, delayFloor: 0 })).toBe(1n);
  });
});
