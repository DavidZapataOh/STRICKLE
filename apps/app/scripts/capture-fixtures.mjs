// usage: node --env-file=/Users/david/tameion/.env apps/app/scripts/capture-fixtures.mjs <vault>
// Writes the explorer's real answers for one vault, in the shape the logs route returns, for the layout tests.
import { writeFileSync } from "node:fs";
import { getAddress } from "viem";
import { buildUpstream, explorerApiFor } from "../src/app/api/logs/upstream.ts";
import { networks } from "@strickle/arc/networks";
import { build } from "./sync-deployments.mjs";

const vault = getAddress(process.argv[2] ?? "");
const deployments = build().testnet;
const apiKey = process.env.BLOCKSCOUT_API_KEY;
const base = explorerApiFor(networks.testnet.chain.id, networks.testnet.explorerUrl, apiKey);

for (const kind of ["allocated", "split", "private-spend"]) {
  const response = await fetch(buildUpstream(kind, vault, deployments, { base, fromBlock: 0, page: 1, apiKey }));
  const body = await response.json();
  if (!Array.isArray(body.result)) throw new Error(`the explorer did not answer for ${kind}: ${body.message}`);
  // the newest thirty entries are plenty for layout checks and keep the committed file small
  const logs = body.result.slice(-30).map(({ blockNumber, logIndex, timeStamp, transactionHash, topics, data }) => ({ blockNumber, logIndex, timeStamp, transactionHash, topics, data }));
  writeFileSync(new URL(`../tests/fixtures/${kind}.json`, import.meta.url), `${JSON.stringify({ logs, truncated: false }, null, 2)}\n`);
  console.log(`${kind}: ${logs.length} logs`);
}
