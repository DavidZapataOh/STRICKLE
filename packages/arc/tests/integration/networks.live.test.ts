import { createPublicClient, erc20Abi, http } from "viem";
import { describe, expect, it } from "vitest";
import { MIN_FEE_PER_GAS, networks } from "../../src/networks.ts";

describe.each(Object.values(networks))("$name (live)", (network) => {
  const client = createPublicClient({ chain: network.chain, transport: http(network.rpcUrl) });

  it("answers with the configured chain id", async () => {
    expect(await client.getChainId()).toBe(network.chain.id);
  });

  it.each(["usdc", "eurc"] as const)("%s is a 6-decimal ERC-20 with the expected symbol", async (asset) => {
    const address = network[asset];
    expect(await client.readContract({ address, abi: erc20Abi, functionName: "decimals" })).toBe(6);
    expect(await client.readContract({ address, abi: erc20Abi, functionName: "symbol" })).toBe(asset.toUpperCase());
  });

  it("prices blocks at or above the fee floor", async () => {
    const block = await client.getBlock();
    expect(block.baseFeePerGas).toBeGreaterThanOrEqual(MIN_FEE_PER_GAS);
  });
});
