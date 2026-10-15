import { describe, expect, it } from "vitest";
import { AGENT_ACTION, DOMAIN } from "../src/constants.ts";
import { hash } from "../src/poseidon.ts";
import { FREE_POLICY, type Policy, policyHash } from "../src/policy.ts";

const base: Policy = {
  floor: 1_000_000n,
  allowlistRoot: 12345n,
  restricted: true,
  agentKeyHash: 777n,
  agentCap: 500_000n,
  agentActions: AGENT_ACTION.SPLIT | AGENT_ACTION.PAY_ALLOWLISTED,
  releaseDelay: 86_400,
};

describe("policyHash", () => {
  it("hashes the fields in the documented order under the policy tag", () => {
    expect(policyHash(base)).toBe(hash([DOMAIN.POLICY, 1_000_000n, 12345n, 1n, 777n, 500_000n, 9n, 86_400n]));
  });

  it("changes when any single field changes", () => {
    const variants: Policy[] = [
      { ...base, floor: base.floor + 1n },
      { ...base, allowlistRoot: base.allowlistRoot + 1n },
      { ...base, restricted: !base.restricted },
      { ...base, agentKeyHash: base.agentKeyHash + 1n },
      { ...base, agentCap: base.agentCap + 1n },
      { ...base, agentActions: AGENT_ACTION.SWEEP },
      { ...base, releaseDelay: base.releaseDelay + 1 },
    ];
    const hashes = new Set([policyHash(base), ...variants.map(policyHash)]);
    expect(hashes.size).toBe(variants.length + 1);
  });

  it("rejects out-of-range fields", () => {
    expect(() => policyHash({ ...base, floor: 2n ** 64n })).toThrow(/floor does not fit in 64 bits/);
    expect(() => policyHash({ ...base, agentCap: -1n })).toThrow(RangeError);
    expect(() => policyHash({ ...base, agentActions: 16 })).toThrow(/agentActions/);
    expect(() => policyHash({ ...base, releaseDelay: 2 ** 32 })).toThrow(/releaseDelay/);
    expect(() => policyHash({ ...base, releaseDelay: 1.5 })).toThrow(RangeError);
  });

  it("has a free policy with no floor, no restriction and no agent", () => {
    expect(FREE_POLICY).toEqual({
      floor: 0n,
      allowlistRoot: 0n,
      restricted: false,
      agentKeyHash: 0n,
      agentCap: 0n,
      agentActions: 0,
      releaseDelay: 0,
    });
  });
});
