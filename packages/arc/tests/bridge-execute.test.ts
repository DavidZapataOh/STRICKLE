import { describe, expect, it } from "vitest";
import { progressOf, burnTxOf } from "../src/bridge/execute.ts";

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
