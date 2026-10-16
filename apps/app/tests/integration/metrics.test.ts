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
    const { metrics } = await collect({ client, network: "testnet", factory, fromBlock, teamAddresses: [] });
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
  }, 120_000);

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
