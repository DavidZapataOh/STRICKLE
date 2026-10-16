import type { Address, Hex, PublicClient } from "viem";
import { networks, type ArcNetworkName } from "../networks.ts";
import { creditedLog } from "./arrival.ts";
import { ARC_DOMAIN } from "./chains.ts";
import { fetchBurnMessage } from "./iris.ts";
import type { SourceChain, TransferSpeed } from "./types.ts";

/** Follows a burn without the kit: Iris says when Circle forwarded it, the chain says what the vault got. Safe to call again after a reload. */
export async function trackDeposit(input: { network: ArcNetworkName; source: SourceChain; burnTx: Hex; vault: Address; client: PublicClient }): Promise<{ state: "waiting"; appliedSpeed?: TransferSpeed } | { state: "arrived"; forwardTx: Hex; received: bigint; payer: Address; logIndex: number; at: Date }> {
  const message = await fetchBurnMessage(input.network, input.source.domain, input.burnTx);
  const appliedSpeed = message?.appliedSpeed ?? undefined;
  if (!message || message.destinationDomain !== ARC_DOMAIN || !message.forwardTxHash || message.forwardState !== "COMPLETE") return { state: "waiting", ...(appliedSpeed ? { appliedSpeed } : {}) };
  const receipt = await input.client.getTransactionReceipt({ hash: message.forwardTxHash });
  const [first, ...rest] = creditedLog(receipt, networks[input.network].usdc, input.vault);
  if (!first) return { state: "waiting", ...(appliedSpeed ? { appliedSpeed } : {}) };
  const block = await input.client.getBlock({ blockNumber: receipt.blockNumber });
  const received = rest.reduce((sum, credit) => sum + credit.amount, first.amount);
  return { state: "arrived", forwardTx: message.forwardTxHash, received, payer: first.from, logIndex: first.logIndex, at: new Date(Number(block.timestamp) * 1000) };
}
