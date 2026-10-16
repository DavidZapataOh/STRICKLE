import "server-only";
import { type Address, type Hex, type PublicClient, parseAbi, parseAbiItem } from "viem";
import { invoiceKeys } from "@strickle/db/invoice-keys";
import { getPublicClient } from "../chain/client.ts";
import { appNetwork, networkInfo } from "../config/network.ts";
import { relayLimiter, sql } from "./db.ts";
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
  return { env: process.env, sql: sql(), keys, limiter, chain: reader, network: appNetwork(), chainId: info.chain.id, usdc: info.usdc };
}

export function ownerSessionDeps(): OwnerSessionDeps | undefined {
  const deps = paymentDeps();
  if (!deps) return undefined;
  const client = getPublicClient();
  return {
    env: deps.env,
    keys: deps.keys,
    sql: deps.sql,
    limiter: deps.limiter,
    network: deps.network,
    chain: {
      ownerOf: (vault) => client.readContract({ address: vault, abi: ownerAbi, functionName: "owner" }),
      accepts: (owner, digest, signature) => client.verifyHash({ address: owner, hash: digest, signature }),
    },
  };
}
