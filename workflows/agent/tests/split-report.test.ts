// workflows/agent/tests/split-report.test.ts
import { readFileSync } from "node:fs";
import { decodeAbiParameters } from "viem";
import { describe, expect, it } from "vitest";
import { encodeSplitReport } from "../enclave/split-report.ts";

const input = {
  vault: "0x00000000000000000000000000000000000000a1" as const,
  asset: 1,
  seen: 1_000_000n,
  boxes: [4, 6],
  amounts: [840_000n, 160_000n],
  next: 1n,
  ciphertext: "0xc1f7" as const,
};

describe("encodeSplitReport", () => {
  it("is abi.encode(uint8 action, bytes args) with the SPLIT action", () => {
    const [action, args] = decodeAbiParameters([{ type: "uint8" }, { type: "bytes" }], encodeSplitReport(input));
    expect(action).toBe(1);
    const [vault, asset, seen, boxes, amounts, next, ciphertext] = decodeAbiParameters(
      [{ type: "address" }, { type: "uint8" }, { type: "uint256" }, { type: "uint8[]" }, { type: "uint256[]" }, { type: "uint64" }, { type: "bytes" }],
      args,
    );
    expect([vault.toLowerCase(), asset, seen, [...boxes], [...amounts], next, ciphertext]).toEqual([input.vault, 1, 1_000_000n, [4, 6], [840_000n, 160_000n], 1n, "0xc1f7"]);
  });

  it("matches the fixture the Solidity executor decodes", () => {
    const fixture = readFileSync(new URL("./fixtures/split-report.hex", import.meta.url), "utf8").trim();
    expect(encodeSplitReport(input)).toBe(fixture);
  });

  it("refuses mismatched box and amount lists", () => {
    expect(() => encodeSplitReport({ ...input, amounts: [1n] })).toThrow();
  });
});
