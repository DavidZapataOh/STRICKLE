import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { networks, rpcUrl } from "@strickle/arc/networks";
import { getAddress } from "viem";

const contractsDir = new URL("..", import.meta.url).pathname;

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

  const base = ["script", script, "--network", "arc", "--rpc-url", rpc, "--chain-id", String(chainId)];
  execFileSync("arc-forge", [...base, "--broadcast"], { cwd: contractsDir, stdio: "inherit" });

  const manifest = recordDeployment({
    runFile: join(contractsDir, "broadcast", basename(script), String(chainId), "run-latest.json"),
    manifestFile: join(manifestDir, `arc-${network}.json`),
    chainId,
  });

  if (network !== "local") {
    // Verification runs after the manifest is written: a failure must not hide a live deployment.
    // Retry it with the same command (--resume reuses the broadcast artifact; no second deploy).
    const verify = [
      "--resume",
      "--verify",
      "--verifier",
      "blockscout",
      "--verifier-url",
      `${networks[network].explorerUrl}/api/`,
      "--retries",
      String(verifyRetries),
    ];
    execFileSync("arc-forge", [...base, ...verify], { cwd: contractsDir, stdio: "inherit" });
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
