import "server-only";
import { fetchBurnMessage, sourceChainsFor, trackDeposit } from "@strickle/arc/bridge";
import { type PublicClient, createPublicClient, http } from "viem";
import { getPublicClient } from "../chain/client.ts";
import { agentDeploymentsFor, appNetwork } from "../config/network.ts";
import { createChainGuard } from "./chain-guard.ts";
import { cookieGate } from "./cookie-gate.ts";
import { relayLimiter, sessionChecker, sql } from "./db.ts";
import type { DepositDeps } from "./deposits.ts";

// Built on first use: a build for a network whose contracts are not deployed must still compile.
let guard: ReturnType<typeof createChainGuard> | undefined;
const sourceClients = new Map<number, PublicClient>();

const sourceClient = (chainId: number): PublicClient => {
  let client = sourceClients.get(chainId);
  if (!client) {
    const chain = sourceChainsFor(appNetwork()).find((entry) => entry.chainId === chainId);
    if (!chain) throw new Error(`chain ${chainId} is not a source`);
    client = createPublicClient({ transport: http(chain.rpc[0]) }) as PublicClient;
    sourceClients.set(chainId, client);
  }
  return client;
};

export function depositDeps(): DepositDeps | undefined {
  const limiter = relayLimiter();
  if (!limiter) return undefined;
  const network = appNetwork();
  guard ??= createChainGuard(getPublicClient(), agentDeploymentsFor());
  return {
    env: process.env,
    sql: sql(),
    limiter,
    guard,
    access: cookieGate(process.env, sessionChecker()),
    network,
    burn: (domain, burnTx) => fetchBurnMessage(network, domain, burnTx),
    burnSender: async (chainId, burnTx) => (await sourceClient(chainId).getTransaction({ hash: burnTx }).catch(() => null))?.from ?? null,
    track: (input) => trackDeposit({ ...input, client: getPublicClient() }),
  };
}
