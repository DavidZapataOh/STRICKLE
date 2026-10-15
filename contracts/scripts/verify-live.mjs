import { readFileSync } from "node:fs";
import { join } from "node:path";
import { networks, rpcUrl } from "@strickle/arc/networks";
import { createPublicClient, http, parseAbi, toHex } from "viem";

const contractsDir = new URL("..", import.meta.url).pathname;
const abi = parseAbi(["function verify(bytes proof, bytes32[] publicInputs) view returns (bool)"]);

export function loadFixture(name) {
  const base = join(contractsDir, "test", "fixtures", "proofs", name);
  const raw = readFileSync(`${base}.inputs`);
  const inputs = Array.from({ length: raw.length / 32 }, (_, i) => toHex(raw.subarray(i * 32, (i + 1) * 32)));
  return { proof: toHex(readFileSync(`${base}.proof`)), inputs };
}

if (import.meta.main) {
  const network = process.argv[2];
  if (network !== "testnet" && network !== "mainnet") throw new Error("usage: verify-live.mjs <testnet|mainnet>");
  const manifest = JSON.parse(readFileSync(join(contractsDir, "deployments", `arc-${network}.json`), "utf8"));
  const client = createPublicClient({ chain: networks[network].chain, transport: http(rpcUrl(network)) });
  for (const [name, contract] of [["shield", "ShieldVerifier"], ["spend", "SpendVerifier"]]) {
    const entry = manifest.contracts[contract];
    if (!entry) throw new Error(`${contract} is not deployed on ${network}`);
    const { proof, inputs } = loadFixture(name);
    const request = { address: entry.address, abi, functionName: "verify", args: [proof, inputs] };
    const ok = await client.readContract(request);
    const gas = await client.estimateContractGas(request);
    console.log(`${contract} ${entry.address}: verify = ${ok}, gas estimate ${gas}`);
    if (!ok) process.exit(1);
  }
}
