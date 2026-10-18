import { readFileSync } from "node:fs";
import { networks, rpcUrl } from "@strickle/arc/networks";
import { createPublicClient, erc20Abi, http, parseAbiItem } from "viem";
import { describe, expect, it } from "vitest";
import { collect } from "../../src/server/metrics.ts";

const manifest = JSON.parse(readFileSync(new URL("../../../../contracts/deployments/arc-testnet.json", import.meta.url), "utf8")).contracts;
const client = createPublicClient({ chain: networks.testnet.chain, transport: http(rpcUrl("testnet"), { batch: true }) });
const factory = manifest.BoxVaultFactory.address;
const fromBlock = BigInt(manifest.BoxVaultFactory.blockNumber);

describe("collecting from the real testnet factory", () => {
  it("counts the vaults that exist, adds up and agrees with direct reads", async () => {
    const { metrics } = await collect({ client, network: "testnet", factory, fromBlock, teamAddresses: [], executor: manifest.AgentExecutor?.address });
    expect(metrics.vaults.total).toBeGreaterThanOrEqual(1);
    expect(metrics.vaults.team).toBe(0);
    expect(BigInt(metrics.usdcHeld.team) + BigInt(metrics.usdcHeld.organic)).toBe(BigInt(metrics.usdcHeld.total));

    // The endpoint refuses ranges above 100,000 blocks, so the direct read walks the history in 50,000-block ranges.
    const created = [];
    for (let from = fromBlock; from <= BigInt(metrics.asOfBlock); from += 50_000n) {
      const to = from + 49_999n < BigInt(metrics.asOfBlock) ? from + 49_999n : BigInt(metrics.asOfBlock);
      created.push(...(await client.getLogs({ address: factory, event: parseAbiItem("event VaultCreated(address indexed owner, address indexed vault)"), fromBlock: from, toBlock: to })));
    }
    expect(metrics.vaults.total).toBe(created.length);
    const balances = await Promise.all(created.map((log) => client.readContract({ address: networks.testnet.usdc, abi: erc20Abi, functionName: "balanceOf", args: [log.args.vault as `0x${string}`], blockNumber: BigInt(metrics.asOfBlock) })));
    expect(BigInt(metrics.usdcHeld.total)).toBe(balances.reduce((sum, balance) => sum + balance, 0n));

    // what the agent moved: the same events summed straight from the chain, vault by vault
    const walk = async <T,>(read: (from: bigint, to: bigint) => Promise<T[]>): Promise<T[]> => {
      const all: T[] = [];
      for (let from = fromBlock; from <= BigInt(metrics.asOfBlock); from += 50_000n) all.push(...(await read(from, from + 49_999n < BigInt(metrics.asOfBlock) ? from + 49_999n : BigInt(metrics.asOfBlock))));
      return all;
    };
    const vaults = created.map((log) => log.args.vault as `0x${string}`);
    const allocated = await walk((from, to) => client.getLogs({ address: vaults, event: parseAbiItem("event Allocated(uint8 indexed asset, uint8 indexed box, uint256 amount, uint256 newBalance)"), args: { asset: 1 }, fromBlock: from, toBlock: to }));
    expect(BigInt(metrics.agentMoved.byKind.split.total)).toBe(allocated.reduce((sum, log) => sum + (log.args.amount as bigint), 0n));
    const swaps = await walk((from, to) => client.getLogs({ address: vaults, event: parseAbiItem("event Swapped(uint8 indexed box, uint8 indexed assetIn, uint256 amountIn, uint256 received)"), fromBlock: from, toBlock: to }));
    expect(BigInt(metrics.agentMoved.byKind.swap.total)).toBe(swaps.reduce((sum, log) => sum + (Number(log.args.assetIn) === 1 ? (log.args.amountIn as bigint) : (log.args.received as bigint)), 0n));
    const earns = await walk((from, to) => client.getLogs({ address: vaults, event: parseAbiItem("event Earned(uint8 indexed asset, uint8 indexed box, address indexed vault, bool deposit, uint256 amountIn, uint256 received)"), args: { asset: 1 }, fromBlock: from, toBlock: to }));
    expect(BigInt(metrics.agentMoved.byKind.earn.total)).toBe(earns.reduce((sum, log) => sum + (log.args.deposit ? (log.args.amountIn as bigint) : (log.args.received as bigint)), 0n));
    const kinds = Object.values(metrics.agentMoved.byKind);
    expect(kinds.reduce((sum, entry) => sum + BigInt(entry.total), 0n)).toBe(BigInt(metrics.agentMoved.total.total));
  }, 180_000);

  it("gives the same answer when it resumes from a snapshot taken a few thousand blocks earlier", async () => {
    const head = await client.getBlockNumber();
    const earlier = head - 3_000n > fromBlock ? head - 3_000n : fromBlock;
    const first = await collect({ client, network: "testnet", factory, fromBlock, teamAddresses: [], toBlock: earlier });
    const resumed = await collect({ client, network: "testnet", factory, fromBlock, teamAddresses: [], previous: first.state, toBlock: head });
    const full = await collect({ client, network: "testnet", factory, fromBlock, teamAddresses: [], toBlock: head });
    expect(resumed.metrics).toEqual(full.metrics);
    expect(resumed.state).toEqual(full.state);
  }, 180_000);
});
