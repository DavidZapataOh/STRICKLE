import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import test from "node:test";

const src = new URL("../src/", import.meta.url).pathname;
const files = (dir) => readdirSync(dir).flatMap((name) => (statSync(join(dir, name)).isDirectory() ? files(join(dir, name)) : [join(dir, name)]));

// What only exists because the confidential workflow does. Whoever builds another enclave-dependent part adds it here.
const ENCLAVE_DEPENDENT = ["PauseControl", "ProposalCard", "runSend", "signAction", "sealRequest", "useAdjust", "EditRow"];
// The modules that define them, or that wrap them in their own gate, are exempt.
const OWNERS = /(PauseControl|ProposalCard|EditRow|use-adjust|send|request|outcome|confirm|lock|agent-only|agent-mode)\.tsx?$/;

test("a module that mounts an enclave-dependent part also consults the capabilities", () => {
  const offenders = [];
  for (const file of files(src).filter((name) => /\.(ts|tsx)$/.test(name) && !OWNERS.test(name))) {
    const text = readFileSync(file, "utf8");
    const imported = ENCLAVE_DEPENDENT.filter((name) => new RegExp(`import[^;]*\\b${name}\\b[^;]*from`).test(text));
    if (imported.length > 0 && !/(AgentOnly|capabilities\()/.test(text)) offenders.push(`${relative(src, file)} uses ${imported.join(", ")}`);
  }
  assert.deepEqual(offenders, [], "these modules mount agent-dependent parts without checking whether an agent exists");
});
