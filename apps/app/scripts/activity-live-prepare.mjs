// usage: node --env-file=/Users/david/tameion/.env apps/app/scripts/activity-live-prepare.mjs
// Checks what the live proof of the Activity screen needs before either sitting. Prints what is missing and exits non-zero; never prints a secret.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createPublicClient, http, parseAbi } from "viem";
import { networks } from "@strickle/arc/networks";
import { build } from "./sync-deployments.mjs";

const problems = [];
const { AgentState, AgentExecutor } = build().testnet;
const client = createPublicClient({ transport: http(networks.testnet.rpcUrl) });

const bound = await client.readContract({ address: AgentState, abi: parseAbi(["function executor() view returns (address)"]), functionName: "executor" });
if (bound.toLowerCase() !== AgentExecutor.toLowerCase()) problems.push(`AgentState is bound to ${bound}, not to the executor of the app's deployments`);

try {
  execFileSync("node", [new URL("./check-relay-config.mjs", import.meta.url).pathname], { env: process.env, stdio: "pipe" });
} catch (error) {
  problems.push(...String(error.stderr).split("\n").filter(Boolean));
}

const { dailySchedule } = JSON.parse(readFileSync(new URL("../../../workflows/agent/config.production.json", import.meta.url), "utf8"));
if (dailySchedule !== "0 */5 * * * *") problems.push(`dailySchedule is "${dailySchedule}"; the proof expects "0 */5 * * * *" (restore it after the proof)`);
for (const name of ["NEXT_PUBLIC_CIRCLE_CLIENT_KEY", "RUN_LIVE"]) if (!process.env[name]) problems.push(`${name} is not set`);

if (problems.length) {
  for (const problem of problems) console.error(`✘ ${problem}`);
  process.exit(1);
}
console.log("✔ the activity proof can run");
