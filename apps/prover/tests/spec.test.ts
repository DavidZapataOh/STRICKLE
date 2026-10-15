// apps/prover/tests/spec.test.ts
import { noteCommitment } from "@strickle/pool/note";
import { PoolLedger } from "@strickle/pool/ledger";
import { specToWire } from "@strickle/pool/spec-wire";
import { buildSpendInputs } from "@strickle/pool/witness";
import { describe, expect, it } from "vitest";
import { createSpecResolver } from "../src/spec.ts";
import { liteSpec } from "./spec-fixture.ts";

const wireOf = (lite: ReturnType<typeof liteSpec>["lite"]) => JSON.parse(JSON.stringify(specToWire(lite)));

describe("the spec resolver", () => {
  it("builds the same circuit inputs the pool package builds for the full spec, against the ledger it holds", async () => {
    const { ledger, lite, tree, allowlist } = liteSpec();
    const resolver = createSpecResolver({ sync: async () => undefined, ledger });
    const inputs = await resolver.inputsFor(wireOf(lite));
    const direct = buildSpendInputs({ ...lite, tree, allowlist: { tree: allowlist, index: 0 } } as never);
    expect(inputs).toEqual(direct.inputs);
  });

  it("finds a note's leaf by its commitment", async () => {
    const { ledger, input } = liteSpec();
    const resolver = createSpecResolver({ sync: async () => undefined, ledger });
    expect(await resolver.leaf(noteCommitment(input))).toBe(0);
    expect(await resolver.leaf(1n)).toBeUndefined();
  });

  it("syncs before every answer", async () => {
    const { ledger, lite } = liteSpec();
    let synced = 0;
    const resolver = createSpecResolver({ sync: async () => void (synced += 1), ledger });
    await resolver.inputsFor(wireOf(lite));
    await resolver.leaf(1n);
    expect(synced).toBe(2);
  });

  it("refuses a spec whose input note is not in the ledger", async () => {
    const { lite } = liteSpec();
    const resolver = createSpecResolver({ sync: async () => undefined, ledger: new PoolLedger() });
    await expect(resolver.inputsFor(wireOf(lite))).rejects.toThrow();
  });
});
