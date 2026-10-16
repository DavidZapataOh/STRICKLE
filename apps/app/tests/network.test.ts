import { describe, expect, it } from "vitest";
import { agentDeploymentsFor, deploymentsFor, executorFirstBlock, explorerLink, resolveNetwork, resolveRpc } from "../src/config/network.ts";

describe("the network configuration", () => {
  it("defaults to testnet and accepts only the two networks", () => {
    expect(resolveNetwork(undefined)).toBe("testnet");
    expect(resolveNetwork("mainnet")).toBe("mainnet");
    expect(() => resolveNetwork("mainnnet")).toThrow(/testnet or mainnet/);
  });

  it("takes the endpoint from the arc package unless an https override is given", () => {
    expect(resolveRpc("testnet", undefined)).toBe("https://rpc.blockdaemon.testnet.arc.io");
    expect(resolveRpc("testnet", "https://rpc.example.test")).toBe("https://rpc.example.test");
    expect(resolveRpc("testnet", "http://insecure.test")).toBe("https://rpc.blockdaemon.testnet.arc.io");
  });

  it("knows the three contracts on testnet and says so when a network has none", () => {
    const deployed = { ...deploymentsFor("testnet"), ...agentDeploymentsFor("testnet") };
    for (const address of [deployed.BoxVaultFactory, deployed.AgentState, deployed.AgentExecutor]) expect(address).toMatch(/^0x[0-9a-fA-F]{40}$/);
    expect(() => deploymentsFor("mainnet")).toThrow(/not deployed on mainnet/);
  });

  it("links the network's own explorer", () => {
    expect(explorerLink("address", "0xabc", "testnet")).toBe("https://explorer.testnet.arc.io/address/0xabc");
    expect(explorerLink("tx", "0xdef", "mainnet")).toBe("https://explorer.arc.io/tx/0xdef");
  });

  it("carries the pool and the deployment blocks the activity reader needs", () => {
    const testnet = agentDeploymentsFor("testnet");
    expect(testnet.PolicyPool).toMatch(/^0x[0-9a-fA-F]{40}$/);
    expect(testnet.blocks.AgentExecutor).toBeGreaterThan(0);
    expect(executorFirstBlock("testnet")).toBe(BigInt(testnet.blocks.AgentExecutor));
  });
});
