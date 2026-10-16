import { describe, expect, it } from "vitest";
import { isSponsorshipError } from "../src/sponsorship.ts";

const named = (name: string, message: string) => Object.assign(new Error(message), { name });

describe("isSponsorshipError", () => {
  it.each([
    ["an ERC-4337 paymaster code", new Error("UserOperation reverted during simulation with reason: AA31 paymaster deposit too low")],
    ["an expired paymaster signature", new Error("AA32 paymaster expired or not due")],
    ["a message naming the paymaster", new Error("The paymaster rejected the user operation")],
    ["a message naming the sponsorship", new Error("Gas sponsorship limit reached for this policy")],
    ["a viem-style short message", Object.assign(new Error("failed"), { shortMessage: "paymaster validation failed" })],
    ["a refusal wrapped as the cause of another error", new Error("request failed", { cause: new Error("AA33 reverted") })],
  ])("recognises %s", (_name, error) => {
    expect(isSponsorshipError(error)).toBe(true);
  });

  it.each([
    ["a dismissed passkey prompt", named("NotAllowedError", "The operation either timed out or was not allowed; paymaster")],
    ["an aborted prompt", named("AbortError", "The operation was aborted")],
    ["a network failure", new Error("fetch failed")],
    ["an account-validation failure", new Error("AA23 reverted: signature")],
    ["a revert of the calls themselves", new Error("execution reverted: Stale(5, 3)")],
    ["something that is not an error", undefined],
    ["a string", "paymaster"],
  ])("does not mistake %s for a sponsorship refusal", (_name, error) => {
    expect(isSponsorshipError(error)).toBe(false);
  });
});
