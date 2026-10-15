// workflows/agent/scripts/config-drift.test.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url), "utf8"));
const manifest = read("../../../contracts/deployments/arc-testnet.json").contracts;

for (const file of ["config.staging.json", "config.production.json"]) {
  test(`${file} points at the deployed contracts`, () => {
    const config = read(`../${file}`);
    assert.equal(config.factoryAddress, manifest.BoxVaultFactory.address);
    assert.equal(config.heartbeatAddress, manifest.AgentHeartbeat.address);
    assert.equal(config.stateAddress, manifest.AgentState.address);
  });
}
