import { describe, expect, it } from "vitest";
import { FIELD_MODULUS } from "../src/field.ts";
import { buildSpendInputs } from "../src/witness.ts";
import { World, baseSpend } from "./circuits/fixture.ts";

describe("spend witness", () => {
  it("uses a fresh dummy nullifier for every transaction so two spends never collide", () => {
    const first = buildSpendInputs(baseSpend(new World())).publicInputs;
    const second = buildSpendInputs(baseSpend(new World())).publicInputs;
    expect(first[2]).not.toBe(second[2]);
  });

  it("derives the dummy nullifier from values inside the field", () => {
    const { publicInputs } = buildSpendInputs(baseSpend(new World()));
    expect(publicInputs[2]).toBeLessThan(FIELD_MODULUS);
  });

  it("keeps the dummy nullifier reproducible when the caller fixes the dummy key and salt", () => {
    const spec = { ...baseSpend(new World()), dummyNk: [11n, 22n] as [bigint, bigint], dummySalt: [1n, 2n] as [bigint, bigint] };
    expect(buildSpendInputs(spec).publicInputs[2]).toBe(buildSpendInputs(spec).publicInputs[2]);
  });
});
