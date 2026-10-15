import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { run } from "./toolchain.mjs";

const root = new URL("..", import.meta.url).pathname;
const committedDir = join(root, "contracts", "src", "pool", "verifiers");
const PAIRING_POINT_ELEMENTS = 8;

export const CIRCUITS = [
  { name: "shield", contract: "ShieldVerifier" },
  { name: "spend", contract: "SpendVerifier" },
];

export function renameVerifier(source, contract) {
  if (!source.includes("contract HonkVerifier is")) throw new Error("generated file has no HonkVerifier declaration");
  return source.replace("contract HonkVerifier is", `contract ${contract} is`);
}

export function publicInputCount(source) {
  const match = source.match(/NUMBER_OF_PUBLIC_INPUTS = (\d+);/);
  if (!match) throw new Error("generated file has no NUMBER_OF_PUBLIC_INPUTS");
  return Number(match[1]) - PAIRING_POINT_ELEMENTS;
}

function bb(args) {
  const status = run("bb", args, { cwd: root });
  if (status !== 0) throw new Error(`bb ${args.join(" ")} failed (${status})`);
}

export function generate({ outDir }) {
  mkdirSync(outDir, { recursive: true });
  const work = mkdtempSync(join(tmpdir(), "verifiers-"));
  for (const { name, contract } of CIRCUITS) {
    const vkDir = join(work, name);
    bb(["write_vk", "-b", join(root, "circuits", "target", `${name}.json`), "-t", "evm", "-o", vkDir]);
    const raw = join(vkDir, "Verifier.sol");
    bb(["write_solidity_verifier", "-k", join(vkDir, "vk"), "-t", "evm", "-o", raw]);
    writeFileSync(join(outDir, `${contract}.sol`), renameVerifier(readFileSync(raw, "utf8"), contract));
  }
}

export function check() {
  const fresh = mkdtempSync(join(tmpdir(), "verifiers-check-"));
  generate({ outDir: fresh });
  const stale = CIRCUITS.map((c) => `${c.contract}.sol`).filter(
    (file) => readFileSync(join(fresh, file), "utf8") !== readFileSync(join(committedDir, file), "utf8"),
  );
  if (stale.length > 0) throw new Error(`verifiers are out of date: ${stale.join(", ")} (run npm run circuits:verifiers)`);
}

if (import.meta.main) {
  const action = process.argv[2];
  if (action === "generate") generate({ outDir: committedDir });
  else if (action === "check") check();
  else {
    console.error("usage: node scripts/verifiers.mjs <generate|check>");
    process.exit(1);
  }
}
