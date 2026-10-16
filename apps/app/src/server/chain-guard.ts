import "server-only";
import { type Address, type Hex, type PublicClient, parseAbi } from "viem";
import { agentStateAbi } from "../chain/abi.ts";

const executorAbi = parseAbi(["function registered(address vault) view returns (bool)", "function expectedWorkflowId() view returns (bytes32)"]);
const vaultAbi = parseAbi(["function agentPaused() view returns (bool)"]);

// Short caches: the relay checks every request, and the chain does not change faster than the gateway lets requests through.
const VAULT_TTL_MS = 20_000;
const WORKFLOW_TTL_MS = 60_000;

export function createChainGuard(client: PublicClient, addresses: { AgentExecutor: Address; AgentState: Address }, now: () => number = Date.now) {
  const vaults = new Map<string, { at: number; value: { registered: boolean; hasState: boolean; paused: boolean } }>();
  let workflow: { at: number; id: Hex } | undefined;

  return {
    async vault(vault: Address) {
      const hit = vaults.get(vault.toLowerCase());
      if (hit && now() - hit.at < VAULT_TTL_MS) return hit.value;
      const [registered, head] = await Promise.all([
        client.readContract({ address: addresses.AgentExecutor, abi: executorAbi, functionName: "registered", args: [vault] }),
        client.readContract({ address: addresses.AgentState, abi: agentStateAbi, functionName: "head", args: [vault] }),
      ]);
      const paused = registered ? await client.readContract({ address: vault, abi: vaultAbi, functionName: "agentPaused" }) : false;
      const value = { registered, hasState: head[0] > 0n, paused };
      vaults.set(vault.toLowerCase(), { at: now(), value });
      return value;
    },
    async expectedWorkflowId(): Promise<Hex> {
      if (workflow && now() - workflow.at < WORKFLOW_TTL_MS) return workflow.id;
      const id = await client.readContract({ address: addresses.AgentExecutor, abi: executorAbi, functionName: "expectedWorkflowId" });
      workflow = { at: now(), id };
      return id;
    },
  };
}
