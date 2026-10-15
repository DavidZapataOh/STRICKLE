import assert from "node:assert/strict";
import { test } from "node:test";
import { verifierEnv } from "./deploy-pool.mjs";

test("reads the hasher and both verifier addresses from the manifest", () => {
  const manifest = {
    contracts: { Poseidon2Hasher: { address: "0x3" }, ShieldVerifier: { address: "0x1" }, SpendVerifier: { address: "0x2" } },
  };
  assert.deepEqual(verifierEnv(manifest), { POSEIDON2_HASHER: "0x3", SHIELD_VERIFIER: "0x1", SPEND_VERIFIER: "0x2" });
});

test("refuses to deploy the pool before its dependencies exist", () => {
  assert.throws(() => verifierEnv({ contracts: { ShieldVerifier: { address: "0x1" } } }), /deploy the hasher and the verifiers first/);
});
