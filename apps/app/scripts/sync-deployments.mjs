import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const manifest = (name) => JSON.parse(readFileSync(new URL(`../../../contracts/deployments/arc-${name}.json`, import.meta.url), "utf8"));
const target = new URL("../src/chain/deployments.generated.json", import.meta.url);
const AGENT = ["AgentState", "AgentExecutor", "PolicyPool"];

// The core contract is required: a network without it is null and the app refuses to run against it instead of guessing an address.
// The agent contracts exist only where an agent does (never on mainnet while CRE is testnet-only): where one is missing they are null.
export function build(read = manifest) {
  return Object.fromEntries(
    ["testnet", "mainnet"].map((name) => {
      const { chainId, contracts } = read(name);
      if (!contracts.BoxVaultFactory?.address) return [name, null];
      const agent = AGENT.every((contract) => contracts[contract]?.address);
      return [
        name,
        {
          chainId,
          BoxVaultFactory: contracts.BoxVaultFactory.address,
          AgentState: agent ? contracts.AgentState.address : null,
          AgentExecutor: agent ? contracts.AgentExecutor.address : null,
          PolicyPool: agent ? contracts.PolicyPool.address : null,
          AgentHeartbeat: agent ? (contracts.AgentHeartbeat?.address ?? null) : null,
          blocks: agent ? { AgentState: contracts.AgentState.blockNumber, AgentExecutor: contracts.AgentExecutor.blockNumber } : null,
        },
      ];
    }),
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) writeFileSync(target, `${JSON.stringify(build(), null, 2)}\n`);
