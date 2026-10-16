import { decodeFunctionData } from "viem";
import { describe, expect, it } from "vitest";
import { settingsWriteAbi } from "../src/settings/abi.ts";
import { approveRecipientCalls, applyRuleCalls, cancelRuleCalls, pauseCalls, resumeCalls, revokeRecipientCalls, setAgentCalls, setRuleCalls } from "../src/settings/calls.ts";

const vault = "0x00000000000000000000000000000000000000a1" as const;
const agent = "0x00000000000000000000000000000000000000dd" as const;
const who = "0x00000000000000000000000000000000000000b2" as const;
const decode = (data: `0x${string}`) => decodeFunctionData({ abi: settingsWriteAbi, data });

describe("owner calls", () => {
  it("pauses and resumes with one vault call each", () => {
    expect(pauseCalls(vault)).toHaveLength(1);
    expect(pauseCalls(vault)[0]?.to).toBe(vault);
    expect(decode(pauseCalls(vault)[0]!.data).functionName).toBe("pauseAgent");
    expect(decode(resumeCalls(vault)[0]!.data).functionName).toBe("resumeAgent");
  });

  it("changes the cap and window in one call while running", () => {
    const calls = setAgentCalls({ vault, agent, cap: 100_000_000n, windowSeconds: 86_400, paused: false });
    expect(calls).toHaveLength(1);
    expect(decode(calls[0]!.data)).toMatchObject({ functionName: "setAgent", args: [agent, 100_000_000n, 86_400] });
  });

  it("keeps a paused agent paused: setAgent resets the pause, so pauseAgent follows in the same batch", () => {
    const calls = setAgentCalls({ vault, agent, cap: 1n, windowSeconds: 3_600, paused: true });
    expect(calls.map((call) => decode(call.data).functionName)).toEqual(["setAgent", "pauseAgent"]);
  });

  it("refuses a cap that does not fit the contract's uint128 or a window that does not fit uint32", () => {
    expect(() => setAgentCalls({ vault, agent, cap: 2n ** 128n, windowSeconds: 1, paused: false })).toThrow();
    expect(() => setAgentCalls({ vault, agent, cap: 1n, windowSeconds: 2 ** 32, paused: false })).toThrow();
  });

  it("encodes a rule exactly as the vault's struct and the apply, cancel and recipient calls", () => {
    const rule = { delaySeconds: 172_800, alwaysDelayed: true, restricted: true, floor: 5_000_000n, lockedUntil: 1_900_000_000 };
    expect(decode(setRuleCalls({ vault, box: 4, rule })[0]!.data)).toMatchObject({ functionName: "setRule", args: [4, { delay: 172_800, alwaysDelayed: true, restricted: true, floor: 5_000_000n, lockedUntil: 1_900_000_000n }] });
    expect(decode(applyRuleCalls({ vault, box: 4 })[0]!.data)).toMatchObject({ functionName: "applyRuleChange", args: [4] });
    expect(decode(cancelRuleCalls({ vault, box: 4 })[0]!.data)).toMatchObject({ functionName: "cancelRuleChange", args: [4] });
    expect(decode(approveRecipientCalls({ vault, box: 3, who })[0]!.data)).toMatchObject({ functionName: "approveRecipient", args: [3, who] });
    expect(decode(revokeRecipientCalls({ vault, box: 3, who })[0]!.data)).toMatchObject({ functionName: "revokeRecipient", args: [3, who] });
  });

  it("refuses a box outside 1 to 6", () => {
    const rule = { delaySeconds: 0, alwaysDelayed: false, restricted: false, floor: 0n, lockedUntil: 0 };
    expect(() => setRuleCalls({ vault, box: 0, rule })).toThrow();
    expect(() => setRuleCalls({ vault, box: 7, rule })).toThrow();
  });
});
