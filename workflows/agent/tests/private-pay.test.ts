// workflows/agent/tests/private-pay.test.ts
import { generateViewKey } from "@strickle/pool/crypto/keys";
import { AGENT_ACTION, FREE_POLICY, MerkleTree, type Note, type Policy, addressToField, agentKeyHash, noteCommitment, noteNullifier, ownerPkFrom, policyHash } from "@strickle/pool";
import { noteToWire, policyToWire } from "@strickle/pool/spec-wire";
import { recipientLeaf } from "@strickle/pool/witness";
import { describe, expect, it } from "vitest";
import { bytesToHex, getAddress } from "viem";
import { parseMaster } from "../enclave/keys.ts";
import { acceptSpend, planPrivatePay } from "../enclave/private-pay.ts";
import { profileSchema } from "../enclave/profile.ts";

const master = parseMaster(`0x${"11".repeat(32)}`);
const vault = getAddress("0x00000000000000000000000000000000000000a1");
const payee = getAddress("0x00000000000000000000000000000000000000b2");
const VIEWER = bytesToHex(generateViewKey().publicKey);
const AK = 99n;
const NK = 2n;
const AUTH = 3n;
const OWNER = ownerPkFrom(AUTH, NK);
const allowlist = new MerkleTree(10);
allowlist.insert(recipientLeaf(addressToField(payee)));
const policy: Policy = { ...FREE_POLICY, restricted: true, allowlistRoot: allowlist.root, agentKeyHash: agentKeyHash(AK), agentActions: AGENT_ACTION.PAY_ALLOWLISTED, agentCap: 600_000n };
const payroll: Note = { amount: 1_000_000n, ownerPk: OWNER, policy: policyHash(policy), label: 1n, box: "payroll", asset: "USDC", flags: 0, lockUntil: 0n, delayFloor: 0, salt: 3n };

const profile = (overrides: Partial<{ note: Note; policy: Policy; allowlist: string[]; leafIndex: number | null; enabled: boolean }> = {}) =>
  profileSchema.parse({
    version: 1, taxRateBps: 0, taxBufferBps: 10_500, payrollShareBps: 10_000, floorDays: 14, targetDays: 42,
    dailySpend: "20000", payrollDue: "0", salaryOwed: "0", emergencyTarget: "0",
    privateMode: {
      enabled: overrides.enabled ?? true, ak: String(AK), nk: String(NK), authHash: String(AUTH), ownerPk: String(OWNER),
      viewers: [{ tier: "owner", publicKey: VIEWER }],
      notes: [{ note: noteToWire(overrides.note ?? payroll), policy: policyToWire(overrides.policy ?? policy), allowlist: overrides.allowlist ?? [payee], leafIndex: overrides.leafIndex === undefined ? null : overrides.leafIndex }],
    },
  });
const DIGEST = `0x${"77".repeat(32)}` as const;
const input = (p: ReturnType<typeof profile>, request: { box: Note["box"]; to: `0x${string}`; amount: bigint }, version = 4n, requestDigest: `0x${string}` = DIGEST, leafOf: (commitment: bigint) => number | undefined = () => 0, nowSeconds = 1_800_000_000) =>
  ({ profile: p, master, vault, version, requestDigest, nowSeconds, request, leafOf });
const pay = { box: "payroll" as const, to: payee, amount: 300_000n };
const plan = (p = profile(), request = pay, leafOf: (commitment: bigint) => number | undefined = () => 0) => planPrivatePay(input(p, request, 4n, DIGEST, leafOf));

describe("planPrivatePay", () => {
  it("builds a payment that keeps the change in the same box", () => {
    const result = plan();
    if (!result.ok) throw new Error(result.reason);
    expect(result.spec.publicAmount).toBe(300_000n);
    expect(result.spec.recipient).toBe(addressToField(payee));
    expect(result.spec.inputs[0]?.leafIndex).toBe(0);
    expect(result.spec.outputs[0].note.amount).toBe(700_000n);
    expect(result.spec.outputs[0].note.box).toBe("payroll");
    expect(result.spec.now).toBe(1_799_999_995n);
    expect(result.next.privateMode.notes).toHaveLength(1);
    expect(result.next.privateMode.notes[0].note.amount).toBe("700000");
    expect(result.next.privateMode.notes[0].leafIndex).toBeNull();
  });

  it("is reproducible for the same signed request and different for another version or another request", () => {
    const a = plan();
    const b = plan();
    const c = planPrivatePay(input(profile(), pay, 5n));
    const d = planPrivatePay(input(profile(), pay, 4n, `0x${"88".repeat(32)}`));
    if (!a.ok || !b.ok || !c.ok || !d.ok) throw new Error("expected plans");
    expect(a.ciphertext).toBe(b.ciphertext);
    for (const other of [c, d]) {
      expect(other.ciphertext).not.toBe(a.ciphertext);
      expect(other.spec.dummyNk).not.toEqual(a.spec.dummyNk);
    }
  });

  it("expects exactly the public inputs it can recompute", () => {
    const result = plan();
    if (!result.ok) throw new Error(result.reason);
    const nullifier = noteNullifier(NK, noteCommitment(payroll), 0);
    expect(result.expected[1]).toBe(nullifier);
    expect(result.expected[5]).toBe(300_000n);
    expect(result.expected[6]).toBe(addressToField(payee));
    expect(result.expected[0]).toBeUndefined();
    expect(result.expected[8]).toBe(1_799_999_995n);
  });

  it.each([
    ["private mode is off", profile({ enabled: false }), undefined, "private-mode-off"],
    ["there is no note in that box", profile(), { box: "operating" as const, to: payee, amount: 1n }, "no-note"],
    ["the amount is zero", profile(), { box: "payroll" as const, to: payee, amount: 0n }, "amount"],
    ["the amount exceeds the note", profile(), { box: "payroll" as const, to: payee, amount: 1_000_001n }, "amount"],
    ["the amount exceeds the agent's cap", profile(), { box: "payroll" as const, to: payee, amount: 600_001n }, "over-cap"],
    ["the recipient is not in the allowlist", profile(), { box: "payroll" as const, to: getAddress("0x00000000000000000000000000000000000000c3"), amount: 1n }, "not-allowlisted"],
    ["the policy does not grant paying", profile({ policy: { ...policy, agentActions: AGENT_ACTION.SPLIT }, note: { ...payroll, policy: policyHash({ ...policy, agentActions: AGENT_ACTION.SPLIT }) } }), undefined, "not-permitted"],
    ["the note is locked", profile({ note: { ...payroll, lockUntil: 1_900_000_000n } }), undefined, "locked"],
  ])("refuses when %s", (_name, p, request, reason) => {
    expect(plan(p, request)).toEqual({ ok: false, reason });
  });

  it("refuses when the note's leaf cannot be found", () => {
    expect(plan(profile(), pay, () => undefined)).toEqual({ ok: false, reason: "leaf-unknown" });
  });
});

describe("acceptSpend", () => {
  const good = () => {
    const result = plan();
    if (!result.ok) throw new Error(result.reason);
    const inputs = result.expected.map((value, i) => value ?? BigInt(i + 1000));
    return { result, inputs };
  };

  it("accepts public inputs that match what was recomputed and returns the pool's struct", () => {
    const { result, inputs } = good();
    const accepted = acceptSpend(result, inputs);
    expect(accepted.ok).toBe(true);
    if (accepted.ok) expect(accepted.inputs.publicAmount).toBe(300_000n);
  });

  it.each([1, 3, 5, 6, 7, 9, 11, 12])("refuses when public input %i differs", (index) => {
    const { result, inputs } = good();
    inputs[index] = (inputs[index] as bigint) + 1n;
    expect(acceptSpend(result, inputs).ok).toBe(false);
  });

  it("refuses a short answer", () => {
    const { result, inputs } = good();
    expect(acceptSpend(result, inputs.slice(0, 12)).ok).toBe(false);
  });
});
