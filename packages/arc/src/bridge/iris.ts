import { z } from "zod";
import type { Hex } from "viem";
import type { ArcNetworkName } from "../networks.ts";

const message = z.object({
  status: z.enum(["pending_confirmations", "complete"]),
  forwardState: z.string().nullable().optional(),
  forwardTxHash: z.string().regex(/^0x[0-9a-fA-F]{64}$/).nullable().optional(),
  // a burn that Iris has seen but not attested yet carries no decoded body
  decodedMessage: z
    .object({
      sourceDomain: z.string(),
      destinationDomain: z.string(),
      finalityThresholdExecuted: z.string().optional(),
      decodedMessageBody: z.object({ amount: z.string(), feeExecuted: z.string().optional() }),
    })
    .nullable()
    .optional(),
});
const body = z.object({ messages: z.array(message) });

export type IrisMessage = { status: "pending_confirmations" | "complete"; forwardState: string | null; forwardTxHash: Hex | null; amount: bigint | null; feeExecuted: bigint; sourceDomain: number | null; destinationDomain: number | null; appliedSpeed: "fast" | "slow" | null };

export const irisBase = (network: ArcNetworkName): string => (network === "testnet" ? "https://iris-api-sandbox.circle.com" : "https://iris-api.circle.com");

export function parseIrisMessages(value: unknown): IrisMessage[] {
  return body.parse(value).messages.map((m) => ({
    status: m.status,
    forwardState: m.forwardState ?? null,
    forwardTxHash: (m.forwardTxHash as Hex | null | undefined) ?? null,
    amount: m.decodedMessage ? BigInt(m.decodedMessage.decodedMessageBody.amount) : null,
    feeExecuted: BigInt(m.decodedMessage?.decodedMessageBody.feeExecuted ?? "0"),
    sourceDomain: m.decodedMessage ? Number(m.decodedMessage.sourceDomain) : null,
    destinationDomain: m.decodedMessage ? Number(m.decodedMessage.destinationDomain) : null,
    appliedSpeed: m.decodedMessage?.finalityThresholdExecuted === "1000" ? "fast" : m.decodedMessage?.finalityThresholdExecuted === "2000" ? "slow" : null,
  }));
}

/** Null while Iris has not indexed the burn yet ("Message not found" is a 404 there). */
export async function fetchBurnMessage(network: ArcNetworkName, domain: number, burnTx: Hex, fetcher: typeof fetch = fetch): Promise<IrisMessage | null> {
  const response = await fetcher(`${irisBase(network)}/v2/messages/${domain}?transactionHash=${burnTx}`, { headers: { accept: "application/json" } });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Iris answered ${response.status}`);
  return parseIrisMessages(await response.json())[0] ?? null;
}
