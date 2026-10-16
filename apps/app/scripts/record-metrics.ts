import { readFileSync } from "node:fs";
import { networks, rpcUrl } from "@strickle/arc/networks";
import { connect, latestSnapshot, saveSnapshot, waveEvents } from "@strickle/db";
import { createPublicClient, http } from "viem";
import { loadPolicy, loadTeam } from "../src/server/config-files.ts";
import { type CollectorState, type Metrics, collect } from "../src/server/metrics.ts";
import { limitsFor } from "../src/server/wave.ts";

const network = process.argv[2];
if (network !== "testnet" && network !== "mainnet") throw new Error("usage: npm run record-metrics -w app -- <testnet|mainnet> [--rebuild]");
const rebuild = process.argv.includes("--rebuild");
const manifest = JSON.parse(readFileSync(new URL(`../../../contracts/deployments/arc-${network}.json`, import.meta.url), "utf8")).contracts;
const factory = manifest.BoxVaultFactory;
if (!factory) throw new Error(`BoxVaultFactory is not deployed on ${network}`);
const client = createPublicClient({ chain: networks[network].chain, transport: http(rpcUrl(network), { batch: true }) });

const sql = connect(process.env.DATABASE_URL ?? "", { max: 1 });
try {
  const previous = rebuild ? undefined : (await latestSnapshot<Metrics, CollectorState>(sql, network))?.state;
  // The ceilings exist on mainnet only, and only while a tranche is open; testnet carries none.
  const limits = network === "mainnet" ? limitsFor(loadPolicy().policy, await waveEvents(sql)) : undefined;
  const { metrics, state } = await collect({
    client: client as never,
    network,
    factory: factory.address,
    fromBlock: BigInt(factory.blockNumber),
    teamAddresses: loadTeam(),
    limits,
    previous,
  });
  await saveSnapshot(sql, { network, asOfBlock: BigInt(metrics.asOfBlock), payload: metrics, state });
  console.log(`recorded ${network} at block ${metrics.asOfBlock}: ${metrics.vaults.total} vaults, ${metrics.usdcHeld.total} base units held`);
} finally {
  await sql.end();
}
