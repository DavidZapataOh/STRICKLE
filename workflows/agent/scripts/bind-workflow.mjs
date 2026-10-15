// workflows/agent/scripts/bind-workflow.mjs
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const [workflowId] = process.argv.slice(2);
if (!/^0x[0-9a-f]{64}$/.test(workflowId ?? "")) throw new Error("usage: bind-workflow.mjs <0x workflow id>");
const manifest = JSON.parse(readFileSync(new URL("../../../contracts/deployments/arc-testnet.json", import.meta.url), "utf8")).contracts;
for (const name of ["AgentHeartbeat", "AgentState", "AgentExecutor"].filter((contract) => manifest[contract])) {
  execFileSync("cast", ["send", manifest[name].address, "setExpectedWorkflowId(bytes32)", workflowId, "--rpc-url", "https://rpc.testnet.arc.io", "--private-key", process.env.PRIVATE_KEY], { stdio: "inherit" });
}
