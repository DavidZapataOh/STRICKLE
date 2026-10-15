import assert from "node:assert/strict";
import { test } from "node:test";
import { CIRCUITS, publicInputCount, renameVerifier } from "./verifiers.mjs";

const generated = [
  "uint256 constant NUMBER_OF_PUBLIC_INPUTS = 19;",
  "library Errors {}",
  "library Honk {}",
  "interface IVerifier {}",
  "abstract contract BaseZKHonkVerifier is IVerifier {",
  "    function f() external { revert Errors.SumcheckFailed(); }",
  "    Honk.G1Point internal p;",
  "}",
  "contract HonkVerifier is BaseZKHonkVerifier(N, LOG_N, VK_HASH, NUMBER_OF_PUBLIC_INPUTS) {",
].join("\n");

test("renames the verifier contract and keeps its constructor arguments", () => {
  const renamed = renameVerifier(generated, "SpendVerifier");
  assert.match(renamed, /contract SpendVerifier is SpendBaseZKHonkVerifier\(N, LOG_N, VK_HASH, NUMBER_OF_PUBLIC_INPUTS\)/);
  assert.doesNotMatch(renamed, /contract HonkVerifier/);
});

test("prefixes every shared declaration so the two circuits never collide", () => {
  const renamed = renameVerifier(generated, "SpendVerifier");
  assert.match(renamed, /library SpendErrors \{\}/);
  assert.match(renamed, /revert SpendErrors\.SumcheckFailed\(\)/);
  assert.match(renamed, /SpendHonk\.G1Point internal p;/);
  assert.match(renamed, /abstract contract SpendBaseZKHonkVerifier is SpendIVerifier/);
  assert.match(renamed, /contract SpendVerifier is SpendBaseZKHonkVerifier\(/);
  assert.doesNotMatch(renamed, /\b(Errors|Honk|IVerifier|BaseZKHonkVerifier)\b/);
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
