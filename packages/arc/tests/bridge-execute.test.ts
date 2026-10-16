import { describe, expect, it } from "vitest";
import { burnTxOf, executeDeposit, progressOf } from "../src/bridge/execute.ts";

describe("progressOf", () => {
  it("maps the kit's step names", () => {
    expect(progressOf({ name: "approve", state: "success", txHash: "0xa" })).toEqual({ stage: "approve", state: "done", txHash: "0xa" });
    expect(progressOf({ name: "burn", state: "pending" })).toEqual({ stage: "burn", state: "pending" });
    expect(progressOf({ name: "fetchAttestation", state: "success" })).toEqual({ stage: "attestation", state: "done" });
    expect(progressOf({ name: "mint", state: "error" })).toEqual({ stage: "arrival", state: "failed" });
  });
  it("ignores a step it does not know", () => {
    expect(progressOf({ name: "reattest", state: "success" })).toBeNull();
  });
});

describe("burnTxOf", () => {
  it("reads the burn transaction from a result", () => {
    expect(burnTxOf({ steps: [{ name: "approve", txHash: "0x1" }, { name: "burn", txHash: "0x2" }] })).toBe("0x2");
    expect(burnTxOf({ steps: [{ name: "approve", txHash: "0x1" }] })).toBeNull();
  });
});

describe("executeDeposit", () => {
  it("refuses a quote that has expired before it asks the wallet for anything", async () => {
    let calls = 0;
    const kit = { on: () => {}, bridge: async () => { calls++; return { steps: [] }; } };
    const quote = { exact: true, expiresAt: Date.now() - 1_000, amountSent: 1_000_000n, totalDebit: 1_000_000n, amountReceivedMin: 1_000_000n, network: "testnet", sourceAddress: "0x1", vault: "0x2", opaque: null, legs: [{ kind: "bridge", speed: "fast", feeMode: "source", gas: null, fees: [], source: { id: "Base_Sepolia" } }] };
    await expect(executeDeposit({ kit, adapter: {} } as never, quote as never, () => {})).rejects.toMatchObject({ code: "expired" });
    expect(calls).toBe(0);
  });
});
