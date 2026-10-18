import { type Address, type PublicClient, parseAbi } from "viem";
import type { PayerCategory } from "./dataset.ts";

const abi = parseAbi(["function isKnownPayer(address payer) view returns (bool)", "function categoryOf(address payer) view returns (bool known, uint8 category)"]);
const CATEGORIES: readonly PayerCategory[] = ["payroll", "payment-rail", "dao", "grants"];

/** Reads of the known payer registry: the only question a certificate asks is whether a source is known, and in which category. */
export function payerRegistry(client: Pick<PublicClient, "readContract">, address: Address) {
  return {
    isKnownPayer: (payer: Address): Promise<boolean> => client.readContract({ address, abi, functionName: "isKnownPayer", args: [payer] }),
    async categoryOf(payer: Address): Promise<PayerCategory | null> {
      const [known, category] = await client.readContract({ address, abi, functionName: "categoryOf", args: [payer] });
      return known ? (CATEGORIES[category] ?? null) : null;
    },
  };
}
