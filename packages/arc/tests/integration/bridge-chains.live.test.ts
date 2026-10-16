import { createPublicClient, http } from "viem";
import { describe, expect, it } from "vitest";
import { sourceChainsFor } from "../../src/bridge/chains.ts";
import { networks } from "../../src/networks.ts";

describe.each(["testnet", "mainnet"] as const)("%s endpoints", (network) => {
  it.each(sourceChainsFor(network).map((entry) => [entry.id, entry] as const))("%s answers with its own chain id", async (_id, entry) => {
    const client = createPublicClient({ transport: http(entry.rpc[0]) });
    expect(await client.getChainId()).toBe(entry.chainId);
  });

  it("Arc answers with its own chain id", async () => {
    const client = createPublicClient({ transport: http(networks[network].rpcUrl) });
    expect(await client.getChainId()).toBe(networks[network].chain.id);
  });
});

describe("the kit's bundled Arc endpoints", () => {
  it("are known to be unusable, which is why every adapter overrides them", async () => {
    const { BridgeKit } = await import("@circle-fin/bridge-kit");
    const arc = new BridgeKit().getSupportedChains().find((chain) => chain.chain === "Arc_Testnet");
    const host = new URL(arc?.rpcEndpoints[0] as string).host;
    // when the kit fixes its default this test fails: delete the override then
    await expect(fetch(`https://${host}`, { method: "POST", signal: AbortSignal.timeout(8000) })).rejects.toThrow();
  });
});
