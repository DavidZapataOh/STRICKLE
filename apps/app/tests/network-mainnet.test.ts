import { describe, expect, it } from "vitest";
import { resolveDeployments } from "../src/config/network.ts";

const A = "0x00000000000000000000000000000000000000a1" as const;
const generated: Parameters<typeof resolveDeployments>[0] = {
  testnet: { chainId: 5042002, BoxVaultFactory: A, AgentState: "0x00000000000000000000000000000000000000a2", AgentExecutor: "0x00000000000000000000000000000000000000a3", PolicyPool: "0x00000000000000000000000000000000000000a4", AgentHeartbeat: "0x00000000000000000000000000000000000000a5", blocks: { AgentState: 1, AgentExecutor: 2 } },
  mainnet: { chainId: 5042, BoxVaultFactory: A, AgentState: null, AgentExecutor: null, PolicyPool: null, blocks: null },
};

describe("resolveDeployments", () => {
  it("gives mainnet its core contracts and says there is no agent there", () => {
    const mainnet = resolveDeployments(generated, "mainnet");
    expect(mainnet.core).toEqual({ chainId: 5042, BoxVaultFactory: A });
    expect(mainnet.agent).toBeNull();
  });

  it("gives testnet both", () => {
    const testnet = resolveDeployments(generated, "testnet");
    expect(testnet.core.BoxVaultFactory).toBe(A);
    expect(testnet.agent).toEqual({ AgentState: "0x00000000000000000000000000000000000000a2", AgentExecutor: "0x00000000000000000000000000000000000000a3", PolicyPool: "0x00000000000000000000000000000000000000a4", AgentHeartbeat: "0x00000000000000000000000000000000000000a5", blocks: { AgentState: 1, AgentExecutor: 2 } });
  });

  it("refuses a network whose core contracts are not deployed", () => {
    expect(() => resolveDeployments({ ...generated, mainnet: null }, "mainnet")).toThrow("the contracts are not deployed on mainnet");
    expect(() => resolveDeployments({ ...generated, mainnet: { chainId: 5042, BoxVaultFactory: null, AgentState: null, AgentExecutor: null, PolicyPool: null, blocks: null } }, "mainnet")).toThrow("the contracts are not deployed on mainnet");
  });
});
