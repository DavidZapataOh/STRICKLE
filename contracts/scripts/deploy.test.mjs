import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { contractPath, deploy, libraryArgs, recordDeployment, verifierEndpoint } from "./deploy.mjs";

const contractsDir = new URL("..", import.meta.url).pathname;
const PORT = 8561;
const RPC = `http://127.0.0.1:${PORT}`;
const SCRIPT = "test/fixtures/Probe.s.sol";
const FACTORY = "0x4e59b44847b379578588920cA78FbF26c0B4956C";

const cast = (...args) => execFileSync("arc-cast", args, { encoding: "utf8" }).trim();
const forge = (...args) => execFileSync("arc-forge", args, { cwd: contractsDir, encoding: "utf8" }).trim();
const address = (text) => text.match(/0x[0-9a-fA-F]{40}/)[0];

let node;

before(async () => {
  node = spawn("arc-anvil", ["--network", "arc", "--port", String(PORT)], { stdio: "ignore" });
  for (let attempt = 0; attempt < 50; attempt++) {
    try {
      cast("chain-id", "--rpc-url", RPC);
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }
  throw new Error(`arc-anvil did not start on port ${PORT}`);
});

after(() => node?.kill());

function deployerKey() {
  const [wallet] = JSON.parse(cast("wallet", "new", "--json"));
  cast("rpc", "anvil_setBalance", wallet.address, "0xde0b6b3a7640000", "--rpc-url", RPC);
  return wallet.private_key;
}

async function onFreshChain(run) {
  const snapshot = JSON.parse(cast("rpc", "evm_snapshot", "--rpc-url", RPC));
  try {
    return await run();
  } finally {
    cast("rpc", "evm_revert", snapshot, "--rpc-url", RPC);
  }
}

test("deploy fails before any network call when PRIVATE_KEY is missing", () => {
  const saved = process.env.PRIVATE_KEY;
  delete process.env.PRIVATE_KEY;
  try {
    assert.throws(
      () => deploy({ network: "local", script: SCRIPT, rpc: RPC, chainId: 31337, manifestDir: tmpdir() }),
      /PRIVATE_KEY is not set/,
    );
  } finally {
    if (saved) process.env.PRIVATE_KEY = saved;
  }
});

test("deploys through the CREATE2 factory and records the predicted address", () =>
  onFreshChain(() => {
    process.env.PRIVATE_KEY = deployerKey();
    const manifestDir = mkdtempSync(join(tmpdir(), "deployments-"));

    const manifest = deploy({ network: "local", script: SCRIPT, rpc: RPC, chainId: 31337, manifestDir });

    const initCodeHash = cast("keccak", forge("inspect", "Probe", "bytecode"));
    const predicted = address(
      cast("create2", "--salt", cast("keccak", "probe.v1"), "--init-code-hash", initCodeHash, "--deployer", FACTORY),
    );
    const entry = manifest.contracts.Probe;

    assert.equal(entry.address.toLowerCase(), predicted.toLowerCase());
    assert.equal(entry.create2, true);
    assert.match(entry.txHash, /^0x[0-9a-f]{64}$/);
    assert.ok(entry.blockNumber >= 1);
    assert.notEqual(cast("code", entry.address, "--rpc-url", RPC), "0x");
    assert.deepEqual(JSON.parse(readFileSync(join(manifestDir, "arc-local.json"), "utf8")), manifest);
  }));

test("a second deploy with the same salt fails in Foundry and leaves the manifest untouched", () =>
  onFreshChain(() => {
    process.env.PRIVATE_KEY = deployerKey();
    deploy({ network: "local", script: SCRIPT, rpc: RPC, chainId: 31337, manifestDir: mkdtempSync(join(tmpdir(), "first-")) });

    const manifestDir = mkdtempSync(join(tmpdir(), "deployments-"));
    const before = JSON.stringify({ chainId: 31337, contracts: {} });
    writeFileSync(join(manifestDir, "arc-local.json"), before);

    assert.throws(
      () => deploy({ network: "local", script: SCRIPT, rpc: RPC, chainId: 31337, manifestDir }),
      /Command failed: arc-forge script/,
    );
    assert.equal(readFileSync(join(manifestDir, "arc-local.json"), "utf8"), before);
  }));

test("a failed explorer verification still leaves the deployment recorded", () =>
  onFreshChain(() => {
    process.env.PRIVATE_KEY = deployerKey();
    process.env.PROBE_SALT = cast("keccak", `unverifiable-${Date.now()}`);
    const manifestDir = mkdtempSync(join(tmpdir(), "deployments-"));

    // A salt no real deployment uses, so the explorer cannot find this address. Exit code 1 from verify-contract (not 2, which would be Foundry rejecting the arguments).
    assert.throws(
      () =>
        deploy({ network: "testnet", script: SCRIPT, rpc: RPC, chainId: 31337, manifestDir, verifyRetries: 1 }),
      (error) => /Command failed: arc-forge verify-contract/.test(error.message) && error.status === 1,
    );

    delete process.env.PROBE_SALT;
    const manifest = JSON.parse(readFileSync(join(manifestDir, "arc-testnet.json"), "utf8"));
    assert.notEqual(cast("code", manifest.contracts.Probe.address, "--rpc-url", RPC), "0x");
  }));

test("contractPath resolves the source path Foundry needs for verification", () => {
  forge("build");
  assert.equal(contractPath("Probe"), "test/fixtures/Probe.sol:Probe");
  assert.throws(() => contractPath("DoesNotExist"), /no build artifact/);
});

test("recordDeployment ignores transactions without a receipt", () => {
  const dir = mkdtempSync(join(tmpdir(), "run-"));
  const runFile = join(dir, "run-latest.json");
  writeFileSync(
    runFile,
    JSON.stringify({
      transactions: [
        { hash: "0x" + "1".repeat(64), transactionType: "CREATE2", contractName: "Pending", contractAddress: FACTORY },
      ],
      receipts: [],
    }),
  );
  const manifest = recordDeployment({ runFile, manifestFile: join(dir, "manifest.json"), chainId: 1 });
  assert.deepEqual(manifest.contracts, {});
});

test("libraryArgs links a verifier to the library addresses recorded in the manifest", () => {
  forge("build");
  const manifest = {
    contracts: {
      ShieldRelationsLib: { address: "0x00000000000000000000000000000000000000a1" },
      ShieldZKTranscriptLib: { address: "0x00000000000000000000000000000000000000a2" },
    },
  };
  assert.deepEqual(libraryArgs("ShieldVerifier", manifest), [
    "--libraries",
    "src/pool/verifiers/ShieldVerifier.sol:ShieldRelationsLib:0x00000000000000000000000000000000000000a1",
    "--libraries",
    "src/pool/verifiers/ShieldVerifier.sol:ShieldZKTranscriptLib:0x00000000000000000000000000000000000000a2",
  ]);
  assert.deepEqual(libraryArgs("Probe", manifest), []);
  assert.throws(() => libraryArgs("ShieldVerifier", { contracts: {} }), /ShieldRelationsLib is not in the manifest/);
});

test("verification goes through the hosted Blockscout API when a key is set, and the explorer otherwise", () => {
  assert.deepEqual(verifierEndpoint("testnet", 5042002, "key"), { url: "https://api.blockscout.com/5042002/api/", keyArgs: ["--verifier-api-key", "key"] });
  assert.deepEqual(verifierEndpoint("testnet", 5042002, undefined), { url: "https://explorer.testnet.arc.io/api/", keyArgs: [] });
});
