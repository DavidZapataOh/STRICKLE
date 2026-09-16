import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { NETWORK_CONFIGS } from "../strickle-cli/src/network.ts";
import { parseComposePs, probe, readGenesis, summarizeStatus } from "./devnet.ts";

const rootDir = fileURLToPath(new URL("..", import.meta.url));

const { compose, devnetGenesis } = JSON.parse(readFileSync(`${rootDir}toolchain.json`, "utf8")) as {
  compose: string;
  devnetGenesis: string;
};

const config = NETWORK_CONFIGS.undeployed;
const rpcUrl = config.node.replace(/^ws/, "http");

function dockerComposePs(composeFile: string): string {
  try {
    return execFileSync("docker", ["compose", "-f", composeFile, "ps", "-a", "--format", "json"], {
      encoding: "utf8",
    });
  } catch {
    console.error("docker is not installed or not working");
    process.exit(1);
  }
}

const containers = parseComposePs(dockerComposePs(`${rootDir}${compose}`));

const probes = await Promise.all([
  probe("indexer", `${new URL(config.indexer).origin}/ready`),
  probe("proof-server", `${config.proofServer}/health`),
]);

const genesis = await readGenesis(rpcUrl);

for (const { service, status, error, ms } of probes) {
  console.log(`${service.padEnd(13)}${String(status ?? error).padEnd(10)}${ms} ms`);
}
console.log(`node${"".padEnd(9)}${genesis ?? "unknown"}`);

const errors = summarizeStatus({
  services: config.composeServices,
  containers,
  probes,
  genesis,
  expectedGenesis: devnetGenesis,
});

if (errors.length > 0) {
  console.error(errors.join("\n"));
  process.exit(1);
}

console.log("devnet ok");
