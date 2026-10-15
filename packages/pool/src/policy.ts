import { DOMAIN } from "./constants.ts";
import { assertUint } from "./field.ts";
import { hash } from "./poseidon.ts";

export interface Policy {
  floor: bigint;
  allowlistRoot: bigint;
  restricted: boolean;
  agentKeyHash: bigint;
  agentCap: bigint;
  agentActions: number;
  releaseDelay: number;
}

export const FREE_POLICY: Policy = {
  floor: 0n,
  allowlistRoot: 0n,
  restricted: false,
  agentKeyHash: 0n,
  agentCap: 0n,
  agentActions: 0,
  releaseDelay: 0,
};

function assertSmallInt(value: number, max: number, name: string): void {
  if (!Number.isInteger(value) || value < 0 || value > max) throw new RangeError(`${name} must be an integer in 0..${max}`);
}

export function policyHash(policy: Policy): bigint {
  assertUint(policy.floor, 64, "floor");
  assertUint(policy.agentCap, 64, "agentCap");
  assertSmallInt(policy.agentActions, 15, "agentActions");
  assertSmallInt(policy.releaseDelay, 2 ** 32 - 1, "releaseDelay");
  return hash([
    DOMAIN.POLICY,
    policy.floor,
    policy.allowlistRoot,
    policy.restricted ? 1n : 0n,
    policy.agentKeyHash,
    policy.agentCap,
    BigInt(policy.agentActions),
    BigInt(policy.releaseDelay),
  ]);
}
