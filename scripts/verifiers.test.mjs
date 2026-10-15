import assert from "node:assert/strict";
import { test } from "node:test";
import { CIRCUITS, publicInputCount, renameVerifier } from "./verifiers.mjs";

const generated = [
  "uint256 constant NUMBER_OF_PUBLIC_INPUTS = 19;",
  "contract HonkVerifier is BaseZKHonkVerifier(N, LOG_N, VK_HASH, NUMBER_OF_PUBLIC_INPUTS) {",
].join("\n");

test("renames only the verifier contract declaration", () => {
  const renamed = renameVerifier(generated, "SpendVerifier");
  assert.match(renamed, /contract SpendVerifier is BaseZKHonkVerifier/);
  assert.doesNotMatch(renamed, /contract HonkVerifier/);
});

test("refuses a file without the generated declaration", () => {
  assert.throws(() => renameVerifier("contract Other {}", "SpendVerifier"), /HonkVerifier/);
});

test("subtracts the 8 pairing-point elements from the public input count", () => {
  assert.equal(publicInputCount(generated), 11);
  assert.throws(() => publicInputCount("nothing here"), /NUMBER_OF_PUBLIC_INPUTS/);
});

test("lists both circuits with distinct contract names", () => {
  assert.deepEqual(CIRCUITS.map((c) => c.name), ["shield", "spend"]);
  assert.equal(new Set(CIRCUITS.map((c) => c.contract)).size, CIRCUITS.length);
});
