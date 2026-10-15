import { MIN_FEE_PER_GAS, networks, rpcUrl } from "@strickle/arc/networks";
import { readFileSync } from "node:fs";
import { type Address, type Hex, createPublicClient, createWalletClient, getAddress, http, parseAbi } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { type Transfer, expandRisk } from "../src/neighborhood.ts";
import { fetchOfac } from "../src/ofac.ts";
import { evidenceHash, syncScreening } from "../src/sync.ts";

const network = "testnet";
const manifest = JSON.parse(readFileSync(new URL("../../../contracts/deployments/arc-testnet.json", import.meta.url), "utf8"));
const registry = manifest.contracts.ScreeningRegistry.address as Address;
const usdc = networks[network].usdc;

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(name);
const option = (name: string) => args[args.indexOf(name) + 1];
const clear = (flag("--clear") ? args.slice(args.indexOf("--clear") + 1).filter((value) => value.startsWith("0x")) : []).map((value) => getAddress(value));
const days = Number(option("--days") ?? "0");

if (!process.env.PRIVATE_KEY) throw new Error("PRIVATE_KEY is not set");
const account = privateKeyToAccount(process.env.PRIVATE_KEY.startsWith("0x") ? (process.env.PRIVATE_KEY as Hex) : `0x${process.env.PRIVATE_KEY}`);
const transport = http(rpcUrl(network));
const publicClient = createPublicClient({ chain: networks[network].chain, transport });
const walletClient = createWalletClient({ account, chain: networks[network].chain, transport });

const list = await fetchOfac();
console.log(`OFAC SDN list published ${list.published}: ${list.addresses.length} EVM addresses`);

const desired = new Map<Address, 0 | 1 | 2>(list.addresses.map((address) => [address, 2]));

if (days > 0) {
  const head = await publicClient.getBlock();
  const windowSeconds = days * 86_400;
  const transfers: Transfer[] = [];
  const transferEvent = parseAbi(["event Transfer(address indexed from, address indexed to, uint256 value)"])[0];
  const step = 5_000n;
  const blockSeconds = 1; // Arc finalises in under a second; the window is converted conservatively
  const from = head.number > BigInt(windowSeconds / blockSeconds) ? head.number - BigInt(windowSeconds / blockSeconds) : 0n;
  for (let start = from; start <= head.number; start += step) {
    const logs = await publicClient.getLogs({ address: usdc, event: transferEvent, fromBlock: start, toBlock: start + step - 1n < head.number ? start + step - 1n : head.number });
    const timestamps = new Map<bigint, number>();
    for (const log of logs) {
      if (!timestamps.has(log.blockNumber)) timestamps.set(log.blockNumber, Number((await publicClient.getBlock({ blockNumber: log.blockNumber })).timestamp));
      transfers.push({ from: log.args.from as Address, to: log.args.to as Address, timestamp: timestamps.get(log.blockNumber) as number });
    }
  }
  const exempt = new Set<Address>([usdc, manifest.contracts.PolicyPool.address]);
  const exposure = expandRisk({ blocked: new Set(list.addresses), transfers, hops: 1, windowSeconds, now: Number(head.timestamp), exempt });
  for (const [address, entry] of exposure) if (entry.risk === 1 && !desired.has(address)) desired.set(address, 1);
  console.log(`one-hop expansion over ${days} days and ${transfers.length} transfers: ${[...desired.values()].filter((risk) => risk === 1).length} elevated`);
}

for (const address of clear) if (!desired.has(address)) desired.set(address, 0);

const evidence = evidenceHash({ source: "OFAC SDN", published: list.published, listed: list.addresses.length, expansionDays: days, cleared: clear });
const estimate = await publicClient.estimateFeesPerGas();
const fees = { maxFeePerGas: (estimate.maxFeePerGas > MIN_FEE_PER_GAS ? estimate.maxFeePerGas : MIN_FEE_PER_GAS) * 2n, maxPriorityFeePerGas: estimate.maxPriorityFeePerGas };
const result = await syncScreening({ publicClient, walletClient, registry, desired, evidence, fees });
console.log(`screening registry ${registry}: wrote ${result.written}, unchanged ${result.skipped}, evidence ${evidence}`);
