import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { releaseAssets, toolPaths } from "./toolchain.mjs";

const pins = JSON.parse(readFileSync(new URL("../toolchain.json", import.meta.url), "utf8"));

test("pins are exact versions", () => {
  assert.match(pins.nargo, /^\d+\.\d+\.\d+(-[a-z]+\.\d+)?$/);
  assert.match(pins.bb, /^\d+\.\d+\.\d+$/);
});

test("resolves the release assets of every supported platform", () => {
  const p = { nargo: "1.0.0-rc.4", bb: "5.0.1" };
  const mac = releaseAssets(p, "darwin", "arm64");
  assert.equal(mac.nargo.url, "https://github.com/noir-lang/noir/releases/download/v1.0.0-rc.4/noir-aarch64-apple-darwin.tar.gz");
  assert.equal(mac.bb.url, "https://github.com/AztecProtocol/aztec-packages/releases/download/v5.0.1/barretenberg-arm64-darwin.tar.gz");
  const linux = releaseAssets(p, "linux", "x64");
  assert.equal(linux.nargo.url, "https://github.com/noir-lang/noir/releases/download/v1.0.0-rc.4/noir-x86_64-unknown-linux-gnu.tar.gz");
  assert.equal(linux.bb.url, "https://github.com/AztecProtocol/aztec-packages/releases/download/v5.0.1/barretenberg-amd64-linux.tar.gz");
  assert.match(releaseAssets(p, "darwin", "x64").nargo.url, /noir-x86_64-apple-darwin/);
  assert.match(releaseAssets(p, "linux", "arm64").bb.url, /barretenberg-arm64-linux/);
});

test("rejects platforms it cannot install for", () => {
  assert.throws(() => releaseAssets(pins, "win32", "x64"), /unsupported platform/);
});

test("keeps every tool inside the Strickle toolchain directory", () => {
  const paths = toolPaths({ nargo: "1.0.0-rc.4", bb: "5.0.1" }, "/home/dev");
  assert.equal(paths.nargoBin, "/home/dev/.strickle/toolchain/nargo-1.0.0-rc.4/bin/nargo");
  assert.equal(paths.bbBin, "/home/dev/.strickle/toolchain/bb-5.0.1/bb");
  assert.deepEqual(paths.pathEntries, ["/home/dev/.strickle/toolchain/nargo-1.0.0-rc.4/bin", "/home/dev/.strickle/toolchain/bb-5.0.1"]);
});
