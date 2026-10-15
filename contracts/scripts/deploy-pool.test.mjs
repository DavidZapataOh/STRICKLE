import assert from "node:assert/strict";
import { test } from "node:test";
import { verifierEnv } from "./deploy-pool.mjs";

const complete = {
  contracts: {
    Poseidon2Hasher: { address: "0x3" },
    ShieldVerifier: { address: "0x1" },
    SpendVerifier: { address: "0x2" },
    ScreeningRegistry: { address: "0x4" },
    AssociationRegistry: { address: "0x5" },
  },
};

test("reads the hasher, the verifiers and the compliance registries from the manifest", () => {
  assert.deepEqual(verifierEnv(complete), {
    POSEIDON2_HASHER: "0x3",
    SHIELD_VERIFIER: "0x1",
    SPEND_VERIFIER: "0x2",
    SCREENING_REGISTRY: "0x4",
    ASSOCIATION_REGISTRY: "0x5",
  });
});

test("refuses to deploy the pool without the compliance registries", () => {
  const { ScreeningRegistry: _s, ...rest } = complete.contracts;
  assert.throws(() => verifierEnv({ contracts: rest }), /deploy the hasher, the verifiers and the registries first/);
});

test("refuses to deploy the pool before its dependencies exist", () => {
  assert.throws(() => verifierEnv({ contracts: { ShieldVerifier: { address: "0x1" } } }), /deploy the hasher, the verifiers and the registries first/);
});
