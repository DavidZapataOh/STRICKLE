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

if (import.meta.main) {
  const network = process.argv[2];
  if (network !== "testnet") throw new Error("usage: deploy-pool.mjs testnet (mainnet deployments are made deliberately by hand)");
  const manifest = JSON.parse(readFileSync(join(contractsDir, "deployments", `arc-${network}.json`), "utf8"));
  Object.assign(process.env, verifierEnv(manifest));
  deploy({ network, script: "script/DeployPool.s.sol", rpc: rpcUrl(network), chainId: networks[network].chain.id });
}
