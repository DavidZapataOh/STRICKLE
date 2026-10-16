import { readFileSync } from "node:fs";
import { join } from "node:path";
import { networks, rpcUrl } from "@strickle/arc/networks";
import { deploy } from "./deploy.mjs";

const contractsDir = new URL("..", import.meta.url).pathname;

export function verifierEnv(manifest) {
  const hasher = manifest.contracts.Poseidon2Hasher?.address;
  const shield = manifest.contracts.ShieldVerifier?.address;
  const spend = manifest.contracts.SpendVerifier?.address;
  const screening = manifest.contracts.ScreeningRegistry?.address;
  const association = manifest.contracts.AssociationRegistry?.address;
  if (!hasher || !shield || !spend || !screening || !association) throw new Error("deploy the hasher, the verifiers and the registries first");
  return { POSEIDON2_HASHER: hasher, SHIELD_VERIFIER: shield, SPEND_VERIFIER: spend, SCREENING_REGISTRY: screening, ASSOCIATION_REGISTRY: association };
}

export function assertPoolNotOnMainnet(network) {
  if (network === "mainnet") throw new Error("the private pool is testnet only: it is not audited and stays off on mainnet");
}

if (import.meta.main) {
  const network = process.argv[2];
  if (network !== "testnet" && network !== "mainnet") {
    console.error("usage: npm run deploy-pool -w @strickle/contracts -- testnet");
    process.exit(1);
  }
  assertPoolNotOnMainnet(network);
  const manifest = JSON.parse(readFileSync(join(contractsDir, "deployments", `arc-${network}.json`), "utf8"));
  deploy({ network, script: "script/DeployPool.s.sol", rpc: rpcUrl(network), chainId: networks[network].chain.id, env: { ...process.env, ...verifierEnv(manifest) } });
}
