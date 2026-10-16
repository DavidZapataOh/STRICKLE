import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { createInterface } from "node:readline/promises";
import { networks, rpcUrl } from "@strickle/arc/networks";
import { getAddress } from "viem";
import { privateKeyToAddress } from "viem/accounts";

const contractsDir = new URL("..", import.meta.url).pathname;

export function contractPath(name, outDir = join(contractsDir, "out")) {
  for (const dir of readdirSync(outDir)) {
    const artifact = join(outDir, dir, `${name}.json`);
    if (!existsSync(artifact)) continue;
    const target = JSON.parse(readFileSync(artifact, "utf8")).metadata?.settings?.compilationTarget ?? {};
    const source = Object.keys(target).find((path) => target[path] === name);
    if (source) return `${source}:${name}`;
  }
  throw new Error(`no build artifact found for ${name}; run arc-forge build`);
}

export function libraryArgs(name, manifest, outDir = join(contractsDir, "out")) {
  const source = contractPath(name, outDir).split(":")[0];
  const artifact = JSON.parse(readFileSync(join(outDir, basename(source), `${name}.json`), "utf8"));
  const links = artifact.bytecode?.linkReferences ?? {};
  return Object.entries(links).flatMap(([file, libraries]) =>
    Object.keys(libraries).flatMap((library) => {
      const entry = manifest.contracts[library];
      if (!entry) throw new Error(`${library} is not in the manifest; deploy it before ${name}`);
      return ["--libraries", `${file}:${library}:${entry.address}`];
    }),
  );
}

export function recordDeployment({ runFile, manifestFile, chainId }) {
  const run = JSON.parse(readFileSync(runFile, "utf8"));
  const manifest = existsSync(manifestFile)
    ? JSON.parse(readFileSync(manifestFile, "utf8"))
    : { chainId, contracts: {} };

  for (const tx of run.transactions) {
    const creates = tx.transactionType === "CREATE" || tx.transactionType === "CREATE2";
    const receipt = run.receipts.find((r) => r.transactionHash === tx.hash);
    if (!creates || !tx.contractName || !receipt) continue;
    manifest.contracts[tx.contractName] = {
      address: getAddress(tx.contractAddress),
      txHash: tx.hash,
      blockNumber: Number(BigInt(receipt.blockNumber)),
      create2: tx.transactionType === "CREATE2",
    };
  }

  mkdirSync(dirname(manifestFile), { recursive: true });
  writeFileSync(manifestFile, `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}

// Blockscout's hosted API has no per-IP limit for a keyed client; the explorer's own endpoint allows ten requests per window.
export function verifierEndpoint(network, chainId, apiKey = process.env.BLOCKSCOUT_API_KEY) {
  return apiKey
    ? { url: `https://api.blockscout.com/${chainId}/api/`, keyArgs: ["--verifier-api-key", apiKey] }
    : { url: `${networks[network].explorerUrl}/api/`, keyArgs: [] };
}

function verifyContract({ contractName, entry, manifest, network, chainId, rpc, retries }) {
  const libraries = libraryArgs(contractName, manifest);
  const { url, keyArgs } = verifierEndpoint(network, chainId);
  const args = [
    "verify-contract",
    entry.address,
    contractPath(contractName),
    "--chain-id",
    String(chainId),
    "--verifier",
    "blockscout",
    "--verifier-url",
    url,
    ...keyArgs,
    "--retries",
    String(retries),
    "--delay",
    "15",
    "--rpc-url",
    rpc,
  ];
  const env = { ...process.env };
  let configFile;
  if (libraries.length > 0) {
    // Linked libraries must reach the verifier through the build config; as flags the bytecode does not match.
    const linked = libraries.filter((_, i) => i % 2 === 1).map((library) => JSON.stringify(library));
    configFile = join(contractsDir, "foundry.verify.toml");
    writeFileSync(configFile, readFileSync(join(contractsDir, "foundry.toml"), "utf8").replace('libs = ["lib"]', `libs = ["lib"]\nlibraries = [${linked.join(", ")}]`));
    env.FOUNDRY_CONFIG = configFile;
  } else {
    args.push("--guess-constructor-args");
  }
  try {
    execFileSync("arc-forge", args, { cwd: contractsDir, stdio: "inherit", env });
  } finally {
    if (configFile) rmSync(configFile, { force: true });
  }
}

/** What may be broadcast to mainnet: the core contracts only. The private pool and the agent contracts wait for an audit and for an agent that can run there. */
const MAINNET_SCRIPTS = ["DeployVault.s.sol"];

export const withPrefix = (key) => (key.startsWith("0x") ? key : `0x${key}`);

export function resolveDeployer({ network, env = process.env }) {
  const testnetKey = env.PRIVATE_KEY ? withPrefix(env.PRIVATE_KEY) : undefined;
  if (network !== "mainnet") {
    if (!testnetKey) throw new Error("PRIVATE_KEY is not set");
    return { key: testnetKey, address: privateKeyToAddress(testnetKey) };
  }
  if (!env.MAINNET_PRIVATE_KEY) throw new Error("MAINNET_PRIVATE_KEY is not set: mainnet never uses the testnet key");
  const key = withPrefix(env.MAINNET_PRIVATE_KEY);
  const address = privateKeyToAddress(key);
  if (testnetKey && privateKeyToAddress(testnetKey) === address) throw new Error("MAINNET_PRIVATE_KEY is the same key as PRIVATE_KEY: use a separate mainnet key");
  return { key, address };
}

export const confirmationPhrase = ({ script, address }) => `deploy ${basename(script)} to arc mainnet from ${address.slice(0, 10)}`;

const ask = async (question) => {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    return await rl.question(question);
  } finally {
    rl.close();
  }
};

export async function confirmMainnet({ script, address, phrase: given, isTTY = process.stdin.isTTY, env = process.env, ask: prompt = ask }) {
  if (env.CI) throw new Error("mainnet deployments are refused in CI");
  if (!isTTY) throw new Error("mainnet deployments need a terminal: the confirmation is typed by a person");
  const phrase = given ?? confirmationPhrase({ script, address });
  const typed = await prompt(`This spends real money on Arc mainnet.\nType exactly: ${phrase}\n> `);
  if (typed.trim() !== phrase) throw new Error("confirmation phrase did not match: nothing was deployed");
  return phrase;
}

export function deploy({
  network,
  script,
  rpc,
  chainId,
  manifestDir = join(contractsDir, "deployments"),
  verifyRetries = 5,
  exec = execFileSync,
  env = process.env,
  confirmed,
}) {
  if (network === "mainnet" && !MAINNET_SCRIPTS.includes(basename(script))) throw new Error(`${basename(script)} is not deployed to mainnet: only the core contracts go there until an agent and an audit exist`);
  const { key, address: sender } = resolveDeployer({ network, env });
  if (network === "mainnet" && confirmed !== confirmationPhrase({ script, address: sender })) {
    throw new Error("a mainnet deploy needs the typed confirmation phrase");
  }
  const reported = String(exec("arc-cast", ["chain-id", "--rpc-url", rpc], { encoding: "utf8" })).trim();
  if (reported !== String(chainId)) throw new Error(`chain id mismatch: the endpoint answered ${reported}, expected ${chainId}`);

  // The script reads one key, PRIVATE_KEY; no other signing key reaches the child process.
  const { MAINNET_PRIVATE_KEY: _mainnet, ...rest } = env;
  const args = ["script", script, "--network", "arc", "--rpc-url", rpc, "--chain-id", String(chainId), "--sender", sender, "--broadcast"];
  exec("arc-forge", args, { cwd: contractsDir, stdio: "inherit", env: { ...rest, PRIVATE_KEY: key } });

  const runFile = join(contractsDir, "broadcast", basename(script), String(chainId), "run-latest.json");
  const manifest = recordDeployment({ runFile, manifestFile: join(manifestDir, `arc-${network}.json`), chainId });

  if (network !== "local") {
    // Verification runs after the manifest is written: a failure must not hide a live deployment.
    // To retry it, run the same verify-contract command for the address in the manifest.
    const created = JSON.parse(readFileSync(runFile, "utf8")).transactions.filter((tx) => tx.contractName);
    for (const { contractName } of created) {
      const entry = manifest.contracts[contractName];
      if (!entry) continue;
      verifyContract({ contractName, entry, manifest, network, chainId, rpc, retries: verifyRetries });
    }
  }
  return manifest;
}

if (import.meta.main) {
  const [network, script] = process.argv.slice(2);
  if ((network !== "testnet" && network !== "mainnet") || !script) {
    console.error("usage: npm run deploy -w @strickle/contracts -- <testnet|mainnet> <script path>");
    process.exit(1);
  }
  const confirmed = network === "mainnet" ? await confirmMainnet({ script, address: resolveDeployer({ network }).address }) : undefined;
  deploy({ network, script, rpc: rpcUrl(network), chainId: networks[network].chain.id, confirmed });
}
