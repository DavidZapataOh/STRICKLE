import type { BoxKind } from "@strickle/core";
export interface Policy {
    floor: bigint;
    allowlistRoot: bigint;
    restricted: boolean;
    agentKeyHash: bigint;
    agentCap: bigint;
    agentActions: number;
    releaseDelay: number;
    templateRoot: bigint;
}
export declare const FREE_POLICY: Policy;
export declare function policyHash(policy: Policy): bigint;
export declare function templateLeaf(box: BoxKind, policy: bigint): bigint;
