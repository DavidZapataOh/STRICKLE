import { type Address, parseAbi } from "viem";
import { factoryAbi } from "../chain/abi.ts";
import { getPublicClient } from "../chain/client.ts";
import { fetchLogs } from "../chain/logs.ts";
import { type Payment, paymentsFrom } from "../chain/payments.ts";
import { type VaultState, readVault } from "../chain/vault.ts";
import { deploymentsFor } from "../config/network.ts";

export type PublicSnapshot = { vault: VaultState; payments: Payment[]; activity: "ok" | "unavailable" };

/** An address that is not a vault the factory made: the page says "not a Strickle account" instead of rendering whatever a stranger's contract answers. */
export class NotAVaultError extends Error {}

const ownerAbi = parseAbi(["function owner() view returns (address)"]);

async function assertRegistered(vault: Address): Promise<void> {
  const client = getPublicClient();
  const owner = await client.readContract({ address: vault, abi: ownerAbi, functionName: "owner" }).catch(() => null);
  if (!owner) throw new NotAVaultError();
  const registered = await client.readContract({ address: deploymentsFor().BoxVaultFactory, abi: factoryAbi, functionName: "vaultOf", args: [owner] });
  if (registered.toLowerCase() !== vault.toLowerCase()) throw new NotAVaultError();
}

/** What anyone can read about a vault: balances, rules and the agent's visible moves. Never the plan, never a key. */
export async function loadPublicSnapshot(vault: Address, signal?: AbortSignal): Promise<PublicSnapshot> {
  await assertRegistered(vault);
  const state = await readVault(vault);
  try {
    const [allocated, split] = await Promise.all([fetchLogs("allocated", vault, signal), fetchLogs("split", vault, signal)]);
    return { vault: state, payments: paymentsFrom(allocated.logs, split.logs), activity: "ok" };
  } catch (error) {
    if (signal?.aborted) throw error;
    return { vault: state, payments: [], activity: "unavailable" };
  }
}
