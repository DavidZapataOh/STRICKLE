import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const enclave = (name) => readFileSync(new URL(`../../../workflows/agent/enclave/${name}`, import.meta.url), "utf8");

// The browser bundles these modules: no Node built-in may be imported at the top level of any of them.
for (const name of ["signed.ts", "notices.ts", "rpc.ts", "notice-schema.ts", "proposals.ts"]) {
  test(`${name} imports nothing from node:`, () => {
    assert.doesNotMatch(enclave(name), /from\s+["']node:/);
    assert.doesNotMatch(enclave(name), /require\(\s*["']node:/);
  });
}

test("notices.ts never touches Buffer, which a browser does not have", () => {
  assert.doesNotMatch(enclave("notices.ts"), /\bBuffer\b/);
});
