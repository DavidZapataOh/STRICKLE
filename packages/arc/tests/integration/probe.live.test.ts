import { createPublicClient, erc20Abi, http } from "viem";
import { describe, expect, it } from "vitest";
import { networks, rpcUrl } from "../../src/networks.ts";
import { probeNetwork, usdcBalance } from "../../src/probe.ts";

describe.each(["testnet", "mainnet"] as const)("the real %s endpoint", (name) => {
  it("answers as the network we configured and both tokens exist", async () => {
    const probe = await probeNetwork(name);
    expect(probe.chainId).toBe(networks[name].chain.id);
    expect(probe.blockNumber).toBeGreaterThan(0n);
    expect(probe.usdcCodeBytes).toBeGreaterThan(0);
    expect(probe.eurcCodeBytes).toBeGreaterThan(0);
  });

  it("tolerates the batches the collectors and the app send, back to back", async () => {
    // 16, 2, 16 and 16 calls in a row: the default endpoint of each network must answer every one of them.
    const batch = (size: number) =>
      fetch(rpcUrl(name), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(Array.from({ length: size }, (_, i) => ({ jsonrpc: "2.0", id: i + 1, method: "eth_getCode", params: [networks[name].usdc, "latest"] }))),
      }).then((response) => response.json() as Promise<{ error?: unknown }[]>);
    for (const size of [16, 2, 16, 16]) expect((await batch(size)).filter((answer) => answer.error)).toEqual([]);
  });

  it("reads a balance exactly as the token contract reports it", async () => {
    const holder = networks[name].eurc;
    const client = createPublicClient({ chain: networks[name].chain, transport: http(rpcUrl(name)) });
    const reported = await client.readContract({ address: networks[name].usdc, abi: erc20Abi, functionName: "balanceOf", args: [holder] });
    expect(await usdcBalance(name, holder)).toBe(reported);
  });
});
