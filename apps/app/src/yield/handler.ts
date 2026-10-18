import { earnVaultsFor } from "../config/earn.ts";
import { type VaultQuote, parseVaults } from "./vaults.ts";

const EXPLORE = "https://api.circle.com/v1/earnKit/vaults/explore";
const CHAIN = { testnet: "ARC-TESTNET", mainnet: "ARC" } as const;

/** Circle's list of vaults narrowed to the offered ones; a service that is down is an empty list that is not cached, never an error page. */
export async function vaultsAnswer(network: "testnet" | "mainnet", fetchImpl: typeof fetch = fetch): Promise<{ body: { vaults: VaultQuote[] }; cacheable: boolean }> {
  const offered = earnVaultsFor(network);
  if (offered.length === 0) return { body: { vaults: [] }, cacheable: true };
  try {
    const response = await fetchImpl(`${EXPLORE}?${new URLSearchParams({ chain: CHAIN[network], page: "1" })}`, { signal: AbortSignal.timeout(8_000) });
    if (!response.ok) return { body: { vaults: [] }, cacheable: false };
    const vaults = parseVaults(await response.json(), offered);
    return { body: { vaults }, cacheable: vaults.length > 0 };
  } catch {
    return { body: { vaults: [] }, cacheable: false };
  }
}
