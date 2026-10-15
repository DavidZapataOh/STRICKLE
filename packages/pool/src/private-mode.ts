import type { BoxKind } from "@strickle/core";
import type { Address } from "viem";
import { ALLOWLIST_DEPTH, AGENT_ACTION } from "./constants.ts";
import { agentKeyHash } from "./keys.ts";
import { MerkleTree } from "./merkle.ts";
import { type Policy, FREE_POLICY } from "./policy.ts";
import { addressToField } from "./pool-client.ts";
import { recipientLeaf } from "./witness.ts";

/** A box rule as the vault stores it (`BoxLedger.Rule`). */
export interface VaultRule {
  delay: number;
  alwaysDelayed: boolean;
  restricted: boolean;
  floor: bigint;
  lockedUntil: bigint;
}

export const DEFAULT_RULES: Record<BoxKind, VaultRule> = {
  taxes: { delay: 172_800, alwaysDelayed: true, restricted: false, floor: 0n, lockedUntil: 0n },
  payroll: { delay: 86_400, alwaysDelayed: false, restricted: true, floor: 0n, lockedUntil: 0n },
  salary: { delay: 0, alwaysDelayed: false, restricted: false, floor: 0n, lockedUntil: 0n },
  operating: { delay: 0, alwaysDelayed: false, restricted: false, floor: 0n, lockedUntil: 0n },
  emergency: { delay: 86_400, alwaysDelayed: true, restricted: false, floor: 0n, lockedUntil: 0n },
  profit: { delay: 0, alwaysDelayed: false, restricted: false, floor: 0n, lockedUntil: 0n },
};

export interface PrivateModeOptions {
  /** The recipients the vault has approved for this box; they become the pool allowlist. */
  approvedRecipients: Address[];
  /** The agent's bounded key for this box, if one is delegated: it may split and pay allowlisted recipients up to `cap` per transaction. */
  agent?: { key: bigint; cap: bigint };
}

/**
 * The pool policy that carries a vault box's rule into private mode: the same delay, floor and hard lock
 * (the lock becomes the note's `lockUntil`), restricted whenever the vault would make the owner wait, and the
 * approved recipients as the allowlist. In the pool the owner can pay an allowlisted recipient at once, which
 * is slightly more permissive than the vault's always-delayed boxes.
 */
export function policyFromRule(rule: VaultRule, options: PrivateModeOptions): { policy: Policy; lockUntil: bigint; allowlist: MerkleTree } {
  const allowlist = new MerkleTree(ALLOWLIST_DEPTH);
  for (const recipient of options.approvedRecipients) allowlist.insert(recipientLeaf(addressToField(recipient)));
  const restricted = rule.restricted || rule.alwaysDelayed;
  const policy: Policy = {
    ...FREE_POLICY,
    floor: rule.floor,
    restricted,
    allowlistRoot: options.approvedRecipients.length > 0 ? allowlist.root : 0n,
    releaseDelay: rule.delay,
    ...(options.agent
      ? { agentKeyHash: agentKeyHash(options.agent.key), agentCap: options.agent.cap, agentActions: AGENT_ACTION.SPLIT | AGENT_ACTION.PAY_ALLOWLISTED }
      : {}),
  };
  return { policy, lockUntil: rule.lockedUntil, allowlist };
}
