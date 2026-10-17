import "server-only";
import { type Address, type Hex, type PublicClient, parseAbi, parseAbiItem } from "viem";
import { createOnrampServerKit } from "@circle-fin/onramp-kit/server";
import { invoiceKeys } from "@strickle/db/invoice-keys";
import { getPublicClient } from "../chain/client.ts";
import { agentDeploymentsFor, appNetwork, networkInfo } from "../config/network.ts";
import { createChainGuard } from "./chain-guard.ts";
import { relayLimiter, sql } from "./db.ts";
import { onrampConfig } from "../onramp/environment.ts";
import type { CardDeps } from "./onramp.ts";
import { sessionIdOf } from "./onramp-session.ts";
import type { OwnerSessionDeps } from "./owner-session.ts";
import type { PayDeps } from "./pay.ts";
import type { ChainReader } from "./reconcile.ts";

const transferEvent = parseAbiItem("event Transfer(address indexed from, address indexed to, uint256 value)");
const ownerAbi = parseAbi(["function owner() view returns (address)"]);

export function chainReader(client: PublicClient, usdc: Address): ChainReader {
  return {
    receipt: async (hash: Hex) => {
      try {
        const receipt = await client.getTransactionReceipt({ hash });
        return { status: receipt.status, logs: receipt.logs.map((log) => ({ address: log.address, topics: log.topics, data: log.data, logIndex: log.logIndex })), blockNumber: receipt.blockNumber };
      } catch (error) {
        if ((error as { name?: string }).name === "TransactionReceiptNotFoundError") return null;
        throw error;
      }
    },
    blockTime: async (block) => new Date(Number((await client.getBlock({ blockNumber: block })).timestamp) * 1000),
    head: () => client.getBlockNumber(),
    transfersTo: async (vault, from, to) => {
      const logs = await client.getLogs({ address: usdc, event: transferEvent, args: { to: vault }, fromBlock: from, toBlock: to });
      return logs.map((log) => ({ txHash: log.transactionHash, logIndex: log.logIndex, payer: log.args.from as Address, amount: log.args.value as bigint, blockNumber: log.blockNumber }));
    },
  };
}

let reader: ChainReader | undefined;
let guard: ReturnType<typeof createChainGuard> | undefined;

/** Built on first use: a build for a network without these services must still compile. Without INVOICE_SECRET or a database every route answers misconfigured. */
export function paymentDeps(): PayDeps | undefined {
  const secret = process.env.INVOICE_SECRET;
  const limiter = relayLimiter();
  if (!secret || !limiter) return undefined;
  let keys: ReturnType<typeof invoiceKeys>;
  try {
    keys = invoiceKeys(secret);
  } catch {
    return undefined;
  }
  const info = networkInfo();
  reader ??= chainReader(getPublicClient(), info.usdc);
  return { env: process.env, sql: sql(), keys, limiter, chain: reader, network: appNetwork(), chainId: info.chain.id, usdc: info.usdc, onramp: onrampConfig(process.env, appNetwork()) };
}

export function ownerSessionDeps(): OwnerSessionDeps | undefined {
  const deps = paymentDeps();
  if (!deps) return undefined;
  const client = getPublicClient();
  const vaults = (guard ??= createChainGuard(client, agentDeploymentsFor()));
  return {
    env: deps.env,
    keys: deps.keys,
    sql: deps.sql,
    limiter: deps.limiter,
    network: deps.network,
    chain: {
      registered: async (vault) => (await vaults.vault(vault)).registered,
      ownerOf: (vault) => client.readContract({ address: vault, abi: ownerAbi, functionName: "owner" }),
      accepts: (owner, digest, signature) => client.verifyHash({ address: owner, hash: digest, signature }),
    },
  };
}

/** The card option: absent (and every card route answers unavailable) unless the key and the embedding domain are set for this network's environment. */
export function cardDeps(): CardDeps | undefined {
  const deps = paymentDeps();
  if (!deps) return undefined;
  const config = onrampConfig(process.env, appNetwork());
  return {
    ...deps,
    onramp: config,
    mint: async (params) => {
      if (!config) throw new Error("card payments are not configured");
      // stateless and cheap: built per call so a key change in the environment is picked up
      const kit = createOnrampServerKit({ apiKey: config.apiKey, baseUrl: config.apiBaseUrl, widgetBaseUrl: config.widgetBaseUrl, referrerDomain: config.referrerDomain });
      const session = await kit.createSession(params);
      return { sessionId: sessionIdOf(session), sessionToken: session.sessionToken, widgetUrl: session.widgetUrl, expiresAt: session.expiresAt, ...(session.destinationWallet ? { destinationWallet: session.destinationWallet } : {}) };
    },
  };
}
