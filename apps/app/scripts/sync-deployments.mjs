import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const manifest = (name) => JSON.parse(readFileSync(new URL(`../../../contracts/deployments/arc-${name}.json`, import.meta.url), "utf8"));
const target = new URL("../src/chain/deployments.generated.json", import.meta.url);
const NEEDED = ["BoxVaultFactory", "AgentState", "AgentExecutor"];

// A network that does not list all three contracts is null: the app refuses to run against it instead of guessing an address.
export function build() {
  return Object.fromEntries(
    ["testnet", "mainnet"].map((name) => {
      const { chainId, contracts } = manifest(name);
      if (!NEEDED.every((contract) => contracts[contract]?.address)) return [name, null];
      return [name, { chainId, ...Object.fromEntries(NEEDED.map((contract) => [contract, contracts[contract].address])) }];
    }),
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) writeFileSync(target, `${JSON.stringify(build(), null, 2)}\n`);
