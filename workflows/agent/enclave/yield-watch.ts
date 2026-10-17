import { type Observation, detectAnomalies } from "@strickle/brain";
import { z } from "zod";
import type { Profile } from "./profile.ts";

const entrySchema = z
  .object({
    vaultAddress: z.string(),
    status: z.string(),
    currentApy: z.number().min(0).max(10),
    liquidityProfile: z.object({ available: z.object({ raw: z.string().regex(/^[0-9]{1,40}$/) }).passthrough() }).passthrough(),
  })
  .passthrough();
const listSchema = z.object({ data: z.object({ vaults: z.array(z.unknown()) }).passthrough() }).passthrough();

/** The watched vaults as the brain reads them: the rate, the status and the liquidity from Circle's list, the price from the chain. A vault the answer does not carry, or whose price is unknown, is simply not observed this time. */
export function observe(input: { vaults: readonly { address: string }[]; sharePrices: Record<string, bigint>; list: unknown }): Observation[] {
  const parsed = listSchema.safeParse(input.list);
  if (!parsed.success) return [];
  const entries = parsed.data.data.vaults.flatMap((entry) => {
    const checked = entrySchema.safeParse(entry);
    return checked.success ? [checked.data] : [];
  });
  return input.vaults.flatMap((vault) => {
    const id = vault.address.toLowerCase();
    const price = input.sharePrices[id];
    const found = entries.find((entry) => entry.vaultAddress.toLowerCase() === id);
    if (price === undefined || !found) return [];
    return [{ id, price, apyBps: Math.round(found.currentApy * 10_000), active: found.status === "active", liquidity: BigInt(found.liquidityProfile.available.raw) }];
  });
}

/** Compares this look with the last one the profile holds and stores this one; a vault not seen this time keeps its older observation, so a gap never hides a drop. */
export function watchStep(input: { profile: Profile; now: readonly Observation[]; positions: Record<string, bigint>; nowSeconds: number }): { next: Profile; anomalies: { id: string; reason: "price-drop" | "rate-spike" | "inactive" | "illiquid" }[] } {
  const before: Observation[] = input.profile.yieldWatch.vaults.map((entry) => ({ id: entry.id, price: BigInt(entry.price), apyBps: entry.apyBps, active: entry.active, liquidity: 0n }));
  const anomalies = detectAnomalies({ before, now: input.now, held: input.positions });
  if (input.now.length === 0) return { next: input.profile, anomalies };
  const day = (seconds: number) => Math.floor(seconds / 86_400);
  const known = input.now.every((entry) => input.profile.yieldWatch.vaults.some((stored) => stored.id === entry.id));
  // a quiet look inside the same day changes nothing worth a report; anything wrong is stored at once
  if (anomalies.length === 0 && known && input.profile.yieldWatch.at > 0 && day(input.profile.yieldWatch.at) === day(input.nowSeconds)) return { next: input.profile, anomalies };
  const seen = new Set(input.now.map((entry) => entry.id));
  const kept = input.profile.yieldWatch.vaults.filter((entry) => !seen.has(entry.id));
  const vaults = [...input.now.map((entry) => ({ id: entry.id, price: entry.price.toString(), apyBps: entry.apyBps, active: entry.active })), ...kept].slice(0, 4);
  return { next: { ...input.profile, yieldWatch: { at: input.nowSeconds, vaults } }, anomalies };
}
