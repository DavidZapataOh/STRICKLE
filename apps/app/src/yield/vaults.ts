import { z } from "zod";
import type { EarnVault } from "../config/earn.ts";

export type VaultQuote = EarnVault & { apyBps: number; asOf: string };

const listSchema = z
  .object({ data: z.object({ vaults: z.array(z.object({ vaultAddress: z.string(), currentApy: z.number().min(0).max(10), asOf: z.string().max(40) }).passthrough()) }).passthrough() })
  .passthrough();

/** Circle's list of vaults narrowed to the ones the app offers, with each yield in basis points of a year; an answer it cannot read is no vaults at all. */
export function parseVaults(body: unknown, offered: readonly EarnVault[]): VaultQuote[] {
  const parsed = listSchema.safeParse(body);
  if (!parsed.success) return [];
  return offered.flatMap((vault) => {
    const found = parsed.data.data.vaults.find((entry) => entry.vaultAddress.toLowerCase() === vault.address.toLowerCase());
    return found ? [{ ...vault, apyBps: Math.round(found.currentApy * 10_000), asOf: found.asOf }] : [];
  });
}
