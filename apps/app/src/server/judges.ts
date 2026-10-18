import { type Address, type PublicClient, isAddress } from "viem";
import demo from "@/config/demo.json";

export type MariaDoor = { status: "open"; vault: Address } | { status: "unavailable" };

/** The demo account is open only when it is configured and a contract exists at its address on this network. */
export async function mariaDoor(client: Pick<PublicClient, "getCode">, vault: string | null = demo.vault): Promise<MariaDoor> {
  if (vault === null || !isAddress(vault)) return { status: "unavailable" };
  try {
    const code = await client.getCode({ address: vault });
    return code && code !== "0x" ? { status: "open", vault } : { status: "unavailable" };
  } catch {
    return { status: "unavailable" };
  }
}
