import { actionSchema } from "@strickle/agent/signed";
import { describe, expect, it } from "vitest";
import { ADVANCE_STEPS, FAUCET_URL, advanceChange, sandboxEnabled } from "../src/sandbox/advance.ts";

describe("sandbox", () => {
  it("builds the three clock steps as actions the enclave accepts", () => {
    expect(ADVANCE_STEPS).toEqual([1, 7, 30]);
    for (const days of ADVANCE_STEPS) {
      expect(advanceChange(days)).toEqual({ kind: "advance", days });
      expect(actionSchema.safeParse(advanceChange(days)).success).toBe(true);
    }
  });

  it("exists only where the money is test money", () => {
    expect(sandboxEnabled("testnet")).toBe(true);
    expect(sandboxEnabled("mainnet")).toBe(false);
  });

  it("points at Circle's own faucet", () => {
    expect(FAUCET_URL).toBe("https://faucet.circle.com");
  });
});
