import { createPublicClient, erc20Abi, http } from "viem";
import { describe, expect, it } from "vitest";
import { networks } from "../../src/networks.ts";
import { networkStatus } from "../../src/status.ts";

// Gateway wallet contracts, listed in the Arc contract-address reference.
const GATEWAY_WALLET = {
  testnet: "0x0077777d7EBA4688BDeF3E311b846F25870A19B9",
  mainnet: "0x77777777Dcc4d5A8B6E418Fd04D8997ef11000eE",
} as const;

describe.each(["testnet", "mainnet"] as const)("%s status (live)", (name) => {
  it("reports the current block and the USDC balance of an address", async () => {
    const status = await networkStatus(name, GATEWAY_WALLET[name]);
    expect(status.network).toBe(name);
    expect(status.chainId).toBe(networks[name].chain.id);
    expect(status.blockNumber).toBeGreaterThan(0n);
    expect(status.usdc).toMatch(/^\d+(\.\d{1,6})?$/);
  });

  it("agrees with the native 18-decimal balance read at the same block", async () => {
    const network = networks[name];
    const client = createPublicClient({ chain: network.chain, transport: http(network.rpcUrl) });
    const blockNumber = await client.getBlockNumber();
    const address = GATEWAY_WALLET[name];
    const [erc20, native] = await Promise.all([
      client.readContract({ address: network.usdc, abi: erc20Abi, functionName: "balanceOf", args: [address], blockNumber }),
      client.getBalance({ address, blockNumber }),
    ]);
    expect(erc20).toBe(native / 10n ** 12n);
  });
});
