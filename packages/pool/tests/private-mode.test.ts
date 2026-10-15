import { describe, expect, it } from "vitest";
import { MerkleTree } from "../src/merkle.ts";
import { agentKeyHash } from "../src/keys.ts";
import { policyHash } from "../src/policy.ts";
import { DEFAULT_RULES, type VaultRule, policyFromRule } from "../src/private-mode.ts";
import { addressToField } from "../src/pool-client.ts";
import { recipientLeaf } from "../src/witness.ts";

const payee = "0x1D96F2f6BeF1202E4Ce1Ff6Dad0c2CB002861d3e" as const;
const office = "0xA4d4c1f8a763Ef6a0140D04291eCEef913Ffc272" as const;
const free: VaultRule = { delay: 0, alwaysDelayed: false, restricted: false, floor: 0n, lockedUntil: 0n };

describe("vault rule to pool policy", () => {
  it("carries the delay, the floor and the hard lock over unchanged", () => {
    const { policy, lockUntil } = policyFromRule({ delay: 172_800, alwaysDelayed: true, restricted: false, floor: 5_000_000n, lockedUntil: 1_900_000_000n }, { approvedRecipients: [] });
    expect(policy.releaseDelay).toBe(172_800);
    expect(policy.floor).toBe(5_000_000n);
    expect(lockUntil).toBe(1_900_000_000n);
  });

  it("makes a free box a free policy", () => {
    const { policy } = policyFromRule(free, { approvedRecipients: [payee] });
    expect(policy.restricted).toBe(false);
    expect(policyHash(policy)).toBe(policyHash({ ...policy, allowlistRoot: policy.allowlistRoot }));
  });

  it("restricts a payroll box to the approved recipients with their Merkle root", () => {
    const { policy, allowlist } = policyFromRule(DEFAULT_RULES.payroll, { approvedRecipients: [payee, office] });
    expect(policy.restricted).toBe(true);
    const reference = new MerkleTree(10);
    reference.insert(recipientLeaf(addressToField(payee)));
    reference.insert(recipientLeaf(addressToField(office)));
    expect(policy.allowlistRoot).toBe(reference.root);
    expect(allowlist.root).toBe(reference.root);
  });

  it("restricts an always-delayed box too, so leaving it needs the release delay", () => {
    expect(policyFromRule(DEFAULT_RULES.taxes, { approvedRecipients: [office] }).policy.restricted).toBe(true);
    expect(policyFromRule(DEFAULT_RULES.emergency, { approvedRecipients: [] }).policy.restricted).toBe(true);
  });

  it("gives an empty allowlist a root nobody can prove membership of", () => {
    const { policy } = policyFromRule(DEFAULT_RULES.emergency, { approvedRecipients: [] });
    expect(policy.allowlistRoot).toBe(0n);
  });

  it("describes the agent's bounded key, cap and actions when there is one", () => {
    const { policy } = policyFromRule(free, { approvedRecipients: [payee], agent: { key: 777n, cap: 100_000_000n } });
    expect(policy.agentKeyHash).toBe(agentKeyHash(777n));
    expect(policy.agentCap).toBe(100_000_000n);
    expect(policy.agentActions).toBe(9);
    expect(policyFromRule(free, { approvedRecipients: [] }).policy.agentKeyHash).toBe(0n);
  });

  it("follows the product's default rules for every box", () => {
    expect(DEFAULT_RULES.taxes).toMatchObject({ delay: 172_800, alwaysDelayed: true });
    expect(DEFAULT_RULES.payroll).toMatchObject({ delay: 86_400, restricted: true });
    expect(DEFAULT_RULES.emergency).toMatchObject({ delay: 86_400, alwaysDelayed: true });
    for (const box of ["salary", "operating", "profit"] as const) expect(DEFAULT_RULES[box]).toMatchObject({ delay: 0, alwaysDelayed: false, restricted: false });
  });

  it("is deterministic and sensitive to every rule field", () => {
    const base = policyFromRule(DEFAULT_RULES.payroll, { approvedRecipients: [payee] }).policy;
    expect(policyHash(policyFromRule(DEFAULT_RULES.payroll, { approvedRecipients: [payee] }).policy)).toBe(policyHash(base));
    for (const change of [{ delay: 1 }, { floor: 1n }, { restricted: false }] as Partial<VaultRule>[]) {
      expect(policyHash(policyFromRule({ ...DEFAULT_RULES.payroll, ...change }, { approvedRecipients: [payee] }).policy)).not.toBe(policyHash(base));
    }
    expect(policyHash(policyFromRule(DEFAULT_RULES.payroll, { approvedRecipients: [office] }).policy)).not.toBe(policyHash(base));
  });
});
