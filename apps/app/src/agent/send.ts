import type { Action } from "@strickle/agent/signed";
import type { Address } from "viem";
import { agentStateAbi } from "../chain/abi.ts";
import { getPublicClient } from "../chain/client.ts";
import { agentDeploymentsFor, deploymentsFor } from "../config/network.ts";
import { isPasskeyCancelled } from "../wallet/errors.ts";
import { type Outcome, type Phase, runSend } from "./outcome.ts";
import { createNonceStore } from "./nonce-store.ts";
import { type Signer, sealRequest, signAction } from "./request.ts";
import type { RelayResult } from "../server/relay-types.ts";

export async function sendAgentAction(args: { wallet: Signer; vault: Address; action: Action; onPhase: (phase: Phase) => void; confirm: () => Promise<boolean> }): Promise<Outcome> {
  const client = getPublicClient();
  const deployments = { ...deploymentsFor(), ...agentDeploymentsFor() };
  const nonces = createNonceStore();
  return runSend(
    {
      sign: async () => {
        const [block, enclaveKey] = await Promise.all([
          client.getBlock({ blockTag: "latest" }),
          client.readContract({ address: deployments.AgentState, abi: agentStateAbi, functionName: "enclaveKey" }),
        ]);
        const request = await signAction({ signer: args.wallet, vault: args.vault, action: args.action, executor: deployments.AgentExecutor, chainId: deployments.chainId, chainSeconds: Number(block.timestamp), clockMs: Date.now(), lastNonce: nonces.last(args.vault) });
        nonces.remember(args.vault, BigInt(request.nonce));
        return sealRequest({ request, enclaveKey });
      },
      post: async (envelope) => {
        const response = await fetch("/api/agent-action", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(envelope), signal: AbortSignal.timeout(25_000) });
        return (await response.json()) as RelayResult;
      },
      confirmed: args.confirm,
      sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
      now: () => Date.now(),
      random: () => Math.random(),
      isCancelled: isPasskeyCancelled,
    },
    args.onPhase,
  );
}
