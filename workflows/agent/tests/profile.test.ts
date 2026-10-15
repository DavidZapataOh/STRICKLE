// workflows/agent/tests/profile.test.ts
import { describe, expect, it } from "vitest";
import { MAX_STATE_PLAINTEXT, MAX_SUBMITTED_BYTES, decodeProfile, encodeProfile, profileSchema } from "../enclave/profile.ts";

const valid = {
  version: 1 as const,
  taxRateBps: 2_000,
  taxBufferBps: 10_500,
  payrollShareBps: 10_000,
  floorDays: 14,
  targetDays: 42,
  dailySpend: "40000000",
  payrollDue: "0",
  salaryOwed: "1500000000",
  emergencyTarget: "9000000000",
};

describe("profile", () => {
  it("round-trips through canonical bytes", () => {
    expect(decodeProfile(encodeProfile(valid))).toEqual(valid);
  });

  it("encodes the same bytes whatever the key order of the input", () => {
    const shuffled = Object.fromEntries(Object.entries(valid).reverse()) as typeof valid;
    expect(encodeProfile(shuffled)).toEqual(encodeProfile(valid));
  });

  it("stays well under the contract's size cap", () => {
    expect(encodeProfile(valid).length).toBeLessThan(MAX_SUBMITTED_BYTES / 2);
    expect(MAX_SUBMITTED_BYTES + 49).toBeLessThanOrEqual(4_800);
    expect(MAX_STATE_PLAINTEXT + 24 + 16).toBe(16_384);
  });

  it.each([
    ["a tax rate over 100%", { taxRateBps: 10_001 }],
    ["a buffer below 105%", { taxBufferBps: 10_499 }],
    ["a buffer above 110%", { taxBufferBps: 11_001 }],
    ["a negative floor", { floorDays: -1 }],
    ["a target below the floor", { floorDays: 30, targetDays: 20 }],
    ["an amount with a decimal point", { dailySpend: "40.5" }],
    ["a negative amount", { salaryOwed: "-1" }],
    ["an unknown field", { surprise: 1 }],
    ["another version", { version: 2 }],
  ])("refuses %s", (_name, patch) => {
    expect(profileSchema.safeParse({ ...valid, ...patch }).success).toBe(false);
  });

  it("refuses bytes that are not a profile, without echoing them", () => {
    const secretLooking = new TextEncoder().encode('{"taxRateBps":"SUPER-SECRET"}');
    let message = "";
    try {
      decodeProfile(secretLooking);
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toBe("profile is not valid");
  });
});
