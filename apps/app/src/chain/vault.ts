import { BOX_KINDS } from "@strickle/core";
import { type Address, type PublicClient, parseAbi } from "viem";
import { factoryAbi } from "./abi.ts";
import { getPublicClient } from "./client.ts";
import { earnVaultsFor } from "../config/earn.ts";
import { appNetwork } from "../config/network.ts";
import { readEarn } from "./earn.ts";
import { vaultReadAbi } from "./read-abi.ts";
import type { BoxState, Conversions, VaultState } from "./totals.ts";

export type { BoxRule, BoxState, VaultState } from "./totals.ts";

const USDC = 1;
const EURC = 2;

export async function readVault(vault: Address, client: PublicClient = getPublicClient()): Promise<VaultState> {
  const call = <T,>(functionName: string, args?: readonly unknown[]) => client.readContract({ address: vault, abi: vaultReadAbi, functionName, args } as never) as Promise<T>;
  const [boxes, unallocatedUsdc, agent, agentPaused, block, conversions, earn] = await Promise.all([
    Promise.all(
      BOX_KINDS.map(async (kind, index) => {
        const id = index + 1;
        const [usdc, eurc, invested, rule] = await Promise.all([
          call<bigint>("boxBalance", [USDC, id]),
          call<bigint>("boxBalance", [EURC, id]),
          call<bigint>("invested", [USDC, id]),
          call<readonly [number, boolean, boolean, bigint, bigint]>("rules", [id]),
        ]);
        return { kind, id, usdc, eurc, invested, rule: { delaySeconds: Number(rule[0]), alwaysDelayed: rule[1], restricted: rule[2], floor: rule[3], lockedUntil: Number(rule[4]) } } satisfies BoxState;
      }),
    ),
    call<bigint>("unallocated", [USDC]),
    call<Address>("agent"),
    call<boolean>("agentPaused"),
    client.getBlock(),
    readConversions(call),
    readEarn(vault, earnVaultsFor(appNetwork()), client),
  ]);
  return { boxes, unallocatedUsdc, agent, agentPaused, now: Number(block.timestamp), conversions, earn };
}

/** A vault created before conversions existed has no such functions: the call reverts, which means "not available", never a broken screen. */
async function readConversions(call: <T>(functionName: string) => Promise<T>): Promise<Conversions> {
  try {
    const [adapter, from, cap, window] = await Promise.all([call<Address>("swapAdapter"), call<bigint>("swapAdapterFrom"), call<bigint>("swapCap"), call<number>("swapWindow")]);
    return { supported: true, adapter, from: Number(from), cap, window: Number(window) };
  } catch {
    return { supported: false };
  }
}

const swapProbeAbi = parseAbi(["function ADAPTER_EXECUTE() view returns (bytes4)"]);

/** True when the factory's vault implementation can swap: a vault created from an older implementation would revert the whole creation batch on the two swap calls. */
export async function factoryCanSwap(factory: Address, client: PublicClient = getPublicClient()): Promise<boolean> {
  try {
    const implementation = await client.readContract({ address: factory, abi: factoryAbi, functionName: "implementation" });
    await client.readContract({ address: implementation, abi: swapProbeAbi, functionName: "ADAPTER_EXECUTE" });
    return true;
  } catch {
    return false;
  }
}
