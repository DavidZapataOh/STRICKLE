import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { confirmMainnet, confirmationPhrase, deploy, resolveDeployer } from "./deploy.mjs";
import { assertPoolNotOnMainnet } from "./deploy-pool.mjs";

const TESTNET_KEY = `0x${"11".repeat(32)}`;
const MAINNET_KEY = `0x${"22".repeat(32)}`;

test("a mainnet deploy uses only MAINNET_PRIVATE_KEY", () => {
  assert.throws(() => resolveDeployer({ network: "mainnet", env: { PRIVATE_KEY: TESTNET_KEY } }), /MAINNET_PRIVATE_KEY is not set/);
  const resolved = resolveDeployer({ network: "mainnet", env: { PRIVATE_KEY: TESTNET_KEY, MAINNET_PRIVATE_KEY: MAINNET_KEY } });
  assert.equal(resolved.key, MAINNET_KEY);
});

test("the testnet key can never be the mainnet key", () => {
  const unprefixed = TESTNET_KEY.slice(2);
  assert.throws(() => resolveDeployer({ network: "mainnet", env: { PRIVATE_KEY: TESTNET_KEY, MAINNET_PRIVATE_KEY: unprefixed } }), /same key/);
});

test("other networks keep using PRIVATE_KEY", () => {
  assert.equal(resolveDeployer({ network: "testnet", env: { PRIVATE_KEY: TESTNET_KEY, MAINNET_PRIVATE_KEY: MAINNET_KEY } }).key, TESTNET_KEY);
  assert.throws(() => resolveDeployer({ network: "testnet", env: {} }), /PRIVATE_KEY is not set/);
});

test("the confirmation phrase names the script and the deployer", () => {
  const phrase = confirmationPhrase({ script: "script/DeployVault.s.sol", address: "0x1234567890abcdef1234567890abcdef12345678" });
  assert.equal(phrase, "deploy DeployVault.s.sol to arc mainnet from 0x12345678");
});

test("confirmation is refused in CI, without a terminal and on a wrong phrase", async () => {
  const base = { script: "script/DeployVault.s.sol", address: "0x1234567890abcdef1234567890abcdef12345678" };
  await assert.rejects(confirmMainnet({ ...base, isTTY: true, env: { CI: "true" }, ask: async () => "" }), /refused in CI/);
  await assert.rejects(confirmMainnet({ ...base, isTTY: false, env: {}, ask: async () => "" }), /need a terminal/);
  await assert.rejects(confirmMainnet({ ...base, isTTY: true, env: {}, ask: async () => "yes" }), /did not match/);
  const phrase = confirmationPhrase(base);
  assert.equal(await confirmMainnet({ ...base, isTTY: true, env: {}, ask: async () => `  ${phrase}  ` }), phrase);
});

// A mainnet broadcast cannot be exercised for real, so the process runner is a stated double that records what would run.
const recorder = (chainId) => {
  const calls = [];
  const exec = (file, args, options) => {
    calls.push({ file, args, env: options?.env });
    return file === "arc-cast" ? `${chainId}\n` : "";
  };
  return { calls, exec };
};
const mainnetEnv = { PRIVATE_KEY: TESTNET_KEY, MAINNET_PRIVATE_KEY: MAINNET_KEY };
const args = () => ({ network: "mainnet", script: "script/DeployVault.s.sol", rpc: "https://rpc.mainnet.arc.io", chainId: 5042, manifestDir: mkdtempSync(join(tmpdir(), "deployments-")), env: mainnetEnv });

test("deploy refuses mainnet without the typed phrase before running anything", () => {
  const { calls, exec } = recorder(5042);
  assert.throws(() => deploy({ ...args(), exec }), /typed confirmation/);
  assert.throws(() => deploy({ ...args(), exec, confirmed: "deploy anything" }), /typed confirmation/);
  assert.equal(calls.length, 0);
});

test("deploy refuses an endpoint that is another chain, before the broadcast", () => {
  const { calls, exec } = recorder(5042002);
  const { address } = resolveDeployer({ network: "mainnet", env: mainnetEnv });
  assert.throws(() => deploy({ ...args(), exec, confirmed: confirmationPhrase({ script: "script/DeployVault.s.sol", address }) }), /chain id mismatch/);
  assert.deepEqual(calls.map((call) => call.file), ["arc-cast"]);
});

test("with the phrase and the right chain the broadcast runs with the mainnet key only", () => {
  const { calls, exec } = recorder(5042);
  const { address } = resolveDeployer({ network: "mainnet", env: mainnetEnv });
  // the run file does not exist because nothing really broadcast: the failure after the calls is expected
  assert.throws(() => deploy({ ...args(), exec, confirmed: confirmationPhrase({ script: "script/DeployVault.s.sol", address }) }), /run-latest\.json/);
  const broadcast = calls.find((call) => call.file === "arc-forge");
  assert.ok(broadcast);
  assert.equal(broadcast.env.PRIVATE_KEY, MAINNET_KEY);
  assert.equal(broadcast.env.MAINNET_PRIVATE_KEY, undefined);
  assert.ok(broadcast.args.includes("--broadcast"));
  assert.ok(broadcast.args.includes("5042"));
});

test("the private pool is never deployed to mainnet", () => {
  assert.throws(() => assertPoolNotOnMainnet("mainnet"), /testnet only/);
  assert.doesNotThrow(() => assertPoolNotOnMainnet("testnet"));
});

test("only the core scripts can go to mainnet: the agent and pool scripts are refused before anything runs", () => {
  const { calls, exec } = recorder(5042);
  const { address } = resolveDeployer({ network: "mainnet", env: mainnetEnv });
  for (const script of ["script/DeployPool.s.sol", "script/DeployAgent.s.sol", "script/DeployHeartbeat.s.sol"]) {
    assert.throws(() => deploy({ ...args(), script, exec, confirmed: confirmationPhrase({ script, address }) }), /not deployed to mainnet/);
  }
  assert.equal(calls.length, 0);
});
