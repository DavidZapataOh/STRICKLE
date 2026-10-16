// workflows/agent/tests/proposals.test.ts
import { describe, expect, it } from "vitest";
import { proposalDigest } from "../enclave/proposals.ts";

const input = { payee: "0x00000000000000000000000000000000000000b2", amount: "1000000", month: "2026-11" };

describe("proposalDigest", () => {
  it("is a 32-byte hex hash", () => {
    expect(proposalDigest(input)).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it("binds the payee, the amount and the month", () => {
    const base = proposalDigest(input);
    expect(proposalDigest({ ...input, payee: "0x00000000000000000000000000000000000000b3" })).not.toBe(base);
    expect(proposalDigest({ ...input, amount: "1000001" })).not.toBe(base);
    expect(proposalDigest({ ...input, month: "2026-12" })).not.toBe(base);
  });

  it("does not depend on the order of the keys", () => {
    expect(proposalDigest({ month: input.month, amount: input.amount, payee: input.payee })).toBe(proposalDigest(input));
  });
});
