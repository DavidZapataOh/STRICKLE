import assert from "node:assert/strict";
import { test } from "node:test";
import { verifierEnv } from "./deploy-pool.mjs";

test("reads both verifier addresses from the manifest", () => {
  const manifest = { contracts: { ShieldVerifier: { address: "0x1" }, SpendVerifier: { address: "0x2" } } };
  assert.deepEqual(verifierEnv(manifest), { SHIELD_VERIFIER: "0x1", SPEND_VERIFIER: "0x2" });
});

test("refuses to deploy the pool before the verifiers exist", () => {
  assert.throws(() => verifierEnv({ contracts: { ShieldVerifier: { address: "0x1" } } }), /deploy the shield and spend verifiers first/);
});
