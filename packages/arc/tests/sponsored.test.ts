import { parseAbi } from "viem";
import { describe, expect, it } from "vitest";
import { abiCall } from "../src/sponsored.ts";

const abi = parseAbi([
  "function allocate(uint8 asset, uint8[] boxes, uint256[] amounts)",
  "function setAgent(address agent, uint128 cap, uint32 window)",
  "function setRule(uint8 box, (uint32 delay, bool alwaysDelayed, bool restricted, uint128 floor, uint64 lockedUntil) rule)",
  "function pause()",
  "function proposeLargePayment(uint8 asset, uint8 box, address to, uint256 amount, bytes32 memo)",
]);

describe("abiCall", () => {
  it("builds the canonical signature and string parameters for arrays of numbers", () => {
    expect(abiCall(abi, "allocate", [1, [1, 3], [2_000_000n, 3n]])).toEqual({
      abiFunctionSignature: "allocate(uint8,uint8[],uint256[])",
      abiParameters: ["1", ["1", "3"], ["2000000", "3"]],
    });
  });

  it("keeps addresses, booleans and bytes32 as they are", () => {
    const to = "0x1D96F2f6BeF1202E4Ce1Ff6Dad0c2CB002861d3e";
    const memo = `0x${"ab".repeat(32)}` as const;
    expect(abiCall(abi, "proposeLargePayment", [1, 3, to, 5n, memo])).toEqual({
      abiFunctionSignature: "proposeLargePayment(uint8,uint8,address,uint256,bytes32)",
      abiParameters: ["1", "3", to, "5", memo],
    });
  });

  it("flattens tuples into their type list and their value list", () => {
    expect(abiCall(abi, "setRule", [1, { delay: 172_800, alwaysDelayed: true, restricted: false, floor: 0n, lockedUntil: 0n }])).toEqual({
      abiFunctionSignature: "setRule(uint8,(uint32,bool,bool,uint128,uint64))",
      abiParameters: ["1", ["172800", true, false, "0", "0"]],
    });
  });

  it("handles functions without arguments", () => {
    expect(abiCall(abi, "pause", [])).toEqual({ abiFunctionSignature: "pause()", abiParameters: [] });
  });

  it("rejects an unknown function and a wrong argument count", () => {
    expect(() => abiCall(abi, "missing", [])).toThrow(/missing/);
    expect(() => abiCall(abi, "allocate", [1])).toThrow(/arguments/);
  });
});
