// workflows/agent/scripts/heartbeat-live.mjs
import { readFileSync } from "node:fs";
import { createPublicClient, http, parseAbi } from "viem";

const manifest = JSON.parse(readFileSync(new URL("../../../contracts/deployments/arc-testnet.json", import.meta.url), "utf8"));
const address = manifest.contracts.AgentHeartbeat.address;
const client = createPublicClient({ transport: http("https://rpc.testnet.arc.io") });
const abi = parseAbi([
  "function lastTick() view returns (uint64)",
  "function ticks() view returns (uint64)",
  "function lastSeen() view returns (address)",
  "function expectedWorkflowId() view returns (bytes32)",
]);
const read = (functionName) => client.readContract({ address, abi, functionName });

const [lastTick, ticks, lastSeen, workflow] = await Promise.all([read("lastTick"), read("ticks"), read("lastSeen"), read("expectedWorkflowId")]);
const factory = manifest.contracts.BoxVaultFactory.address;
const implementation = await client.readContract({ address: factory, abi: parseAbi(["function implementation() view returns (address)"]), functionName: "implementation" });

if (ticks === 0n) throw new Error("no tick recorded yet");
if (lastSeen !== implementation) throw new Error(`heartbeat saw ${lastSeen}, the factory reports ${implementation}`);
console.log(`workflow ${workflow}: ${ticks} ticks, last at ${new Date(Number(lastTick) * 1000).toISOString()}, saw ${lastSeen}`);
