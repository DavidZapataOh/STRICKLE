// usage: node --env-file=/Users/david/tameion/.env apps/app/scripts/check-relay-config.mjs
// Run after every workflow redeploy: a stale CRE_WORKFLOW_ID turns every request into a silent rejection. Never prints a secret.
import { readFileSync } from "node:fs";
import { createPublicClient, http, parseAbi } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import postgres from "postgres";
import { networks } from "@strickle/arc/networks";
import { build } from "./sync-deployments.mjs";

const env = process.env;
const problems = [];
const need = (name) => {
  if (!env[name]) problems.push(`${name} is not set`);
  return env[name];
};

const key = need("CRE_GATEWAY_KEY");
const workflowId = need("CRE_WORKFLOW_ID");
need("CRE_GATEWAY_URL");
need("RELAY_IP_PEPPER");
const databaseUrl = need("DATABASE_URL");

if (key) {
  if (!/^0x[0-9a-fA-F]{64}$/.test(key)) problems.push("CRE_GATEWAY_KEY is not a 0x private key");
  else {
    const { gatewayAddress } = JSON.parse(readFileSync(new URL("../../../workflows/agent/config.production.json", import.meta.url), "utf8"));
    if (privateKeyToAccount(key).address.toLowerCase() !== gatewayAddress.toLowerCase()) problems.push(`CRE_GATEWAY_KEY does not derive the gateway address ${gatewayAddress} of the workflow config`);
  }
}

if (workflowId) {
  const { AgentExecutor } = build().testnet;
  const client = createPublicClient({ transport: http(networks.testnet.rpcUrl) });
  const expected = await client.readContract({ address: AgentExecutor, abi: parseAbi(["function expectedWorkflowId() view returns (bytes32)"]), functionName: "expectedWorkflowId" });
  if (expected.toLowerCase() !== workflowId.toLowerCase()) problems.push(`CRE_WORKFLOW_ID is not the executor's expectedWorkflowId() (${expected})`);
}

if (databaseUrl) {
  const sql = postgres(databaseUrl, { max: 1, connect_timeout: 10 });
  try {
    await sql`select 1`;
    const tables = await sql`select count(*)::int as found from information_schema.tables where table_name in ('rate_counters', 'rate_slots')`;
    if (tables[0]?.found !== 2) problems.push("the relay tables are missing: run the migrations");
  } catch {
    problems.push("DATABASE_URL does not answer");
  } finally {
    await sql.end();
  }
}

if (problems.length) {
  for (const problem of problems) console.error(`✘ ${problem}`);
  process.exit(1);
}
console.log("✔ the relay configuration matches the chain and the database answers");
