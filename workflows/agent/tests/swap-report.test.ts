import { decodeAbiParameters } from "viem";
import { describe, expect, it } from "vitest";
import { encodeSwapReport } from "../enclave/swap-report.ts";

const VAULT = "0x8AB41267Adc223EF245c46537870Ae8744b9b3F8";

describe("encodeSwapReport", () => {
  it("round-trips through the tuple the executor decodes, as action 6", () => {
    const report = encodeSwapReport({ vault: VAULT, box: 2, assetIn: 1, amountIn: 1_000_000n, minOut: 889_000n, seen: 4_000_000n, data: "0xaa3e079c01", next: 7n, ciphertext: "0xc1f7" });
    const [action, args] = decodeAbiParameters([{ type: "uint8" }, { type: "bytes" }], report);
    expect(action).toBe(6);
    const decoded = decodeAbiParameters([{ type: "address" }, { type: "uint8" }, { type: "uint8" }, { type: "uint256" }, { type: "uint256" }, { type: "uint256" }, { type: "bytes" }, { type: "uint64" }, { type: "bytes" }], args);
    expect(decoded).toEqual([VAULT, 2, 1, 1_000_000n, 889_000n, 4_000_000n, "0xaa3e079c01", 7n, "0xc1f7"]);
  });
});
