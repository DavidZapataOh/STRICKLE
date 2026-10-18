import { decodeFunctionData, getAddress } from "viem";
import { describe, expect, it } from "vitest";
import { agentStateAbi, executorAbi, factoryAbi, vaultAbi } from "../src/chain/abi.ts";
import { onboardingCalls } from "../src/onboarding/calls.ts";

const a = (n: number) => getAddress(`0x${n.toString(16).padStart(40, "0")}`);
const args = { factory: a(1), executor: a(2), state: a(3), vault: a(4), owner: a(5), capUnits: 2_000_000_000n, sealed: "0xabcd" as const };

describe("onboardingCalls", () => {
  it("creates the vault, approves the salary payee, delegates the agent, registers and submits, in that order", () => {
    const calls = onboardingCalls({ ...args, vaultExists: false });
    expect(calls.map((call) => call.to)).toEqual([a(1), a(4), a(4), a(2), a(3)]);
    expect(decodeFunctionData({ abi: factoryAbi, data: calls[0]!.data })).toMatchObject({ functionName: "create", args: [a(5)] });
    expect(decodeFunctionData({ abi: vaultAbi, data: calls[1]!.data })).toMatchObject({ functionName: "approveRecipient", args: [3, a(5)] });
    expect(decodeFunctionData({ abi: vaultAbi, data: calls[2]!.data })).toMatchObject({ functionName: "setAgent", args: [a(2), 2_000_000_000n, 86_400] });
    expect(decodeFunctionData({ abi: executorAbi, data: calls[3]!.data })).toMatchObject({ functionName: "register", args: [a(4)] });
    expect(decodeFunctionData({ abi: agentStateAbi, data: calls[4]!.data })).toMatchObject({ functionName: "submitProfile", args: [a(4), "0xabcd"] });
  });

  it("does not try to create a vault that exists", () => {
    const calls = onboardingCalls({ ...args, vaultExists: true });
    expect(calls).toHaveLength(4);
    expect(calls[0]!.to).toBe(a(4));
  });

  it("appends the swap setup and then the yield vault approval, so both waits start at creation", () => {
    const swap = [{ to: a(4), data: "0x01" as const }];
    const earn = [{ to: a(4), data: "0x02" as const }];
    const calls = onboardingCalls({ ...args, vaultExists: false, swapCalls: swap, earnCalls: earn });
    expect(calls.slice(-2)).toEqual([swap[0], earn[0]]);
    expect(onboardingCalls({ ...args, vaultExists: false, earnCalls: earn }).slice(-1)).toEqual(earn);
  });
});
