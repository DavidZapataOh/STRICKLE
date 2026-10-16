import { BOX_KINDS, type BoxKind } from "@strickle/core";
import type { Address, PublicClient } from "viem";
import { getPublicClient } from "./client.ts";
import { vaultReadAbi } from "./read-abi.ts";

export interface BoxRule {
  delaySeconds: number;
  alwaysDelayed: boolean;
  restricted: boolean;
  floor: bigint;
  lockedUntil: number;
}
export interface BoxState {
  kind: BoxKind;
  id: number;
  usdc: bigint;
  eurc: bigint;
  invested: bigint;
  rule: BoxRule;
}
export interface VaultState {
  boxes: BoxState[];
  unallocatedUsdc: bigint;
  agent: Address;
  agentPaused: boolean;
  now: number;
}

const USDC = 1;
const EURC = 2;

export async function readVault(vault: Address, client: PublicClient = getPublicClient()): Promise<VaultState> {
  const call = <T,>(functionName: string, args?: readonly unknown[]) => client.readContract({ address: vault, abi: vaultReadAbi, functionName, args } as never) as Promise<T>;
  const [boxes, unallocatedUsdc, agent, agentPaused, block] = await Promise.all([
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
  ]);
  return { boxes, unallocatedUsdc, agent, agentPaused, now: Number(block.timestamp) };
}

/** What a box holds in US dollars including the part working in a vault; the money is the user's either way. */
export const boxTotal = (box: BoxState): bigint => box.usdc + box.invested;

export const heldTotals = (vault: VaultState): { usdc: bigint; eurc: bigint } => ({
  usdc: vault.boxes.reduce((sum, box) => sum + boxTotal(box), 0n),
  eurc: vault.boxes.reduce((sum, box) => sum + box.eurc, 0n),
});
