import type { BoxKind } from "@strickle/core";
import { type Address, type PublicClient, parseAbi } from "viem";
import type { EarnVault } from "../config/earn.ts";
import { factoryAbi } from "./abi.ts";
import { getPublicClient } from "./client.ts";
import { vaultReadAbi } from "./read-abi.ts";
import type { EarnState } from "./totals.ts";

const yieldAbi = parseAbi(["function previewRedeem(uint256 shares) view returns (uint256)"]);
/** The boxes a person can put to work: the salary box is paid every month and stays liquid. */
const INVESTABLE = [
  ["taxes", 1],
  ["payroll", 2],
  ["operating", 4],
  ["emergency", 5],
  ["profit", 6],
] as const satisfies readonly (readonly [BoxKind, number])[];

const isRevert = (error: unknown): boolean => {
  const named = (error as { walk?: (test: (cause: unknown) => boolean) => unknown }).walk?.((cause) => ["ContractFunctionRevertedError", "ContractFunctionZeroDataError"].includes((cause as { name?: string }).name ?? ""));
  return Boolean(named) || /revert|zero data/i.test(String((error as { message?: string }).message ?? ""));
};

/** An implementation from before yield existed has no `EARN_VERSION`, so that call reverting means "old"; a failed read of anything is "unreadable", never a false claim about the account and never a broken screen. */
export async function readEarn(vault: Address, offered: readonly EarnVault[], client: PublicClient): Promise<EarnState> {
  const call = <T,>(address: Address, abi: typeof vaultReadAbi | typeof yieldAbi, functionName: string, args?: readonly unknown[]) => client.readContract({ address, abi, functionName, args } as never) as Promise<T>;
  try {
    await call<number>(vault, vaultReadAbi, "EARN_VERSION");
  } catch (error) {
    return { supported: false, reason: isRevert(error) ? "old" : "unreadable" };
  }
  try {
    const maxInvestBps = Object.fromEntries(await Promise.all(INVESTABLE.map(async ([kind, id]) => [kind, Number(await call<number>(vault, vaultReadAbi, "maxInvestBps", [id]))] as const)));
    const vaults = await Promise.all(
      offered.map(async (entry) => {
        const approvedFrom = Number(await call<bigint>(vault, vaultReadAbi, "vaultApprovedFrom", [entry.address]));
        const held = await Promise.all(INVESTABLE.map(async ([kind, id]) => [kind, await call<bigint>(vault, vaultReadAbi, "sharesOf", [entry.address, id])] as const));
        const owned = held.filter(([, shares]) => shares > 0n);
        const worth = await Promise.all(owned.map(async ([kind, shares]) => [kind, await call<bigint>(entry.address, yieldAbi, "previewRedeem", [shares])] as const));
        return { vault: entry.address, approvedFrom, shares: Object.fromEntries(owned), value: Object.fromEntries(worth) };
      }),
    );
    const principal = Object.fromEntries(await Promise.all(INVESTABLE.map(async ([kind, id]) => [kind, await call<bigint>(vault, vaultReadAbi, "invested", [1, id])] as const)));
    return { supported: true, vaults, maxInvestBps, invested: principal };
  } catch {
    return { supported: false, reason: "unreadable" };
  }
}

/** True when the factory's vault implementation can earn: a vault created from an older one would revert the whole creation batch on the yield vault approval. */
export async function factoryCanEarn(factory: Address, client: PublicClient = getPublicClient()): Promise<boolean> {
  try {
    const implementation = await client.readContract({ address: factory, abi: factoryAbi, functionName: "implementation" });
    await client.readContract({ address: implementation, abi: vaultReadAbi, functionName: "EARN_VERSION" });
    return true;
  } catch {
    return false;
  }
}
