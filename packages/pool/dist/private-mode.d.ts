import type { BoxKind } from "@strickle/core";
import type { Address } from "viem";
import { MerkleTree } from "./merkle.ts";
import { type Policy } from "./policy.ts";
/** A box rule as the vault stores it (`BoxLedger.Rule`). */
export interface VaultRule {
    delay: number;
    alwaysDelayed: boolean;
    restricted: boolean;
    floor: bigint;
    lockedUntil: bigint;
}
export declare const DEFAULT_RULES: Record<BoxKind, VaultRule>;
export interface PrivateModeOptions {
    /** The recipients the vault has approved for this box; they become the pool allowlist. */
    approvedRecipients: Address[];
    /** The agent's bounded key for this box, if one is delegated: it may split and pay allowlisted recipients up to `cap` per transaction. */
    agent?: {
        key: bigint;
        cap: bigint;
    };
}
/**
 * The pool policy that carries a vault box's rule into private mode: the same delay, floor and hard lock
 * (the lock becomes the note's `lockUntil`), restricted whenever the vault would make the owner wait, and the
 * approved recipients as the allowlist. In the pool the owner can pay an allowlisted recipient at once, which
 * is slightly more permissive than the vault's always-delayed boxes.
 */
export declare function policyFromRule(rule: VaultRule, options: PrivateModeOptions): {
    policy: Policy;
    lockUntil: bigint;
    allowlist: MerkleTree;
};
