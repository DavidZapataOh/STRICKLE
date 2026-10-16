import type { Address, Hex, PublicClient } from "viem";
import { networks, type ArcNetworkName } from "../networks.ts";
import { creditedTo } from "./arrival.ts";
import { ARC_DOMAIN } from "./chains.ts";
import { fetchBurnMessage } from "./iris.ts";
import type { SourceChain } from "./types.ts";

/** Follows a burn without the kit: Iris says when Circle forwarded it, the chain says what the vault got. Safe to call again after a reload. */
export async function trackDeposit(input: { network: ArcNetworkName; source: SourceChain; burnTx: Hex; vault: Address; client: PublicClient }): Promise<{ state: "waiting" } | { state: "arrived"; forwardTx: Hex; received: bigint }> {
  const message = await fetchBurnMessage(input.network, input.source.domain, input.burnTx);
  if (!message || message.destinationDomain !== ARC_DOMAIN || !message.forwardTxHash || message.forwardState !== "COMPLETE") return { state: "waiting" };
  const receipt = await input.client.getTransactionReceipt({ hash: message.forwardTxHash });
  const received = creditedTo(receipt, networks[input.network].usdc, input.vault);
  return received > 0n ? { state: "arrived", forwardTx: message.forwardTxHash, received } : { state: "waiting" };
}
