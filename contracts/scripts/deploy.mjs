import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
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

export function deploy({
  network,
  script,
  rpc,
  chainId,
  manifestDir = join(contractsDir, "deployments"),
  verifyRetries = 5,
}) {
  if (!process.env.PRIVATE_KEY) throw new Error("PRIVATE_KEY is not set");

  const key = process.env.PRIVATE_KEY.startsWith("0x") ? process.env.PRIVATE_KEY : `0x${process.env.PRIVATE_KEY}`;
  const sender = privateKeyToAddress(key);
  const args = ["script", script, "--network", "arc", "--rpc-url", rpc, "--chain-id", String(chainId), "--sender", sender, "--broadcast"];
  execFileSync("arc-forge", args, { cwd: contractsDir, stdio: "inherit" });

  const runFile = join(contractsDir, "broadcast", basename(script), String(chainId), "run-latest.json");
  const manifest = recordDeployment({ runFile, manifestFile: join(manifestDir, `arc-${network}.json`), chainId });

  if (network !== "local") {
    // Verification runs after the manifest is written: a failure must not hide a live deployment.
    // To retry it, run the same verify-contract command for the address in the manifest.
    const created = JSON.parse(readFileSync(runFile, "utf8")).transactions.filter((tx) => tx.contractName);
    for (const { contractName } of created) {
      const entry = manifest.contracts[contractName];
      if (!entry) continue;
      execFileSync(
        "arc-forge",
        [
          "verify-contract",
          entry.address,
          contractPath(contractName),
          "--chain-id",
          String(chainId),
          "--verifier",
          "blockscout",
          "--verifier-url",
          `${networks[network].explorerUrl}/api/`,
          "--retries",
          String(verifyRetries),
          "--delay",
          "15",
          ...libraryArgs(contractName, manifest),
        ],
        { cwd: contractsDir, stdio: "inherit" },
      );
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
  deploy({ network, script, rpc: rpcUrl(network), chainId: networks[network].chain.id });
}
