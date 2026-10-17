import { readFileSync } from "node:fs";
import { networks, rpcUrl } from "@strickle/arc/networks";
import { createPublicClient, http } from "viem";
import { describe, expect, it } from "vitest";
import { agentDeploymentsFor, deploymentsFor } from "../../src/config/network.ts";
import { agentActivity, contractsReport } from "../../src/server/proof.ts";

const client = createPublicClient({ chain: networks.testnet.chain, transport: http(rpcUrl("testnet"), { batch: true }) });

describe("the proof page against the real testnet", () => {
  it("finds code at every contract the app is built against", async () => {
    const core = deploymentsFor("testnet");
    const agent = agentDeploymentsFor("testnet");
    const manifest = { BoxVaultFactory: { address: core.BoxVaultFactory }, AgentState: { address: agent.AgentState }, AgentExecutor: { address: agent.AgentExecutor }, PolicyPool: { address: agent.PolicyPool } };
    const rows = await contractsReport({ manifest, client, explorer: async () => null });
    expect(rows.map((row) => [row.name, row.deployed])).toEqual([["BoxVaultFactory", true], ["AgentState", true], ["AgentExecutor", true], ["PolicyPool", true]]);
  }, 60_000);

  it("reads the agent's activity without failing, whether or not it has written recently", async () => {
    const activity = await agentActivity(client, agentDeploymentsFor("testnet").AgentState);
    expect(activity.lastWriteAt === null || activity.lastWriteAt > 1_700_000_000).toBe(true);
  }, 60_000);

  it("holds the same manifest the repository records for the core contracts", () => {
    const manifest = JSON.parse(readFileSync(new URL("../../../../contracts/deployments/arc-testnet.json", import.meta.url), "utf8")).contracts;
    expect(deploymentsFor("testnet").BoxVaultFactory.toLowerCase()).toBe(manifest.BoxVaultFactory.address.toLowerCase());
  });
});
