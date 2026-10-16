// Reads the public testnet; run by `npm run test:live`, like the chain live test.
import { describe, expect, it } from "vitest";
import { getPublicClient } from "../../src/chain/client.ts";
import { deploymentsFor } from "../../src/config/network.ts";
import { readSettingsChain } from "../../src/settings/chain.ts";

const registry = [{ type: "function", name: "vaults", stateMutability: "view", inputs: [{ type: "uint256" }], outputs: [{ type: "address" }] }] as const;

describe("readSettingsChain against the real testnet", () => {
  it("reads the agent's limits and the pending rule changes of a registered vault", async () => {
    const vault = await getPublicClient().readContract({ address: deploymentsFor().AgentExecutor, abi: registry, functionName: "vaults", args: [0n] });
    const state = await readSettingsChain(getPublicClient(), vault);
    expect(state.limits.agent).toMatch(/^0x[0-9a-fA-F]{40}$/);
    expect(typeof state.limits.paused).toBe("boolean");
    expect(state.limits.cap >= 0n).toBe(true);
    expect(state.pending).toHaveLength(6);
    for (const entry of state.pending) expect(entry === null || (entry.box >= 1 && entry.box <= 6)).toBe(true);
  });
});
