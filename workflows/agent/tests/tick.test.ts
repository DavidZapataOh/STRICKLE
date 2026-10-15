// workflows/agent/tests/tick.test.ts
import { decodeAbiParameters, getAddress } from "viem";
import { describe, expect, it } from "vitest";
import { encodeTick } from "../tick.ts";

describe("encodeTick", () => {
  it("matches abi.encode(uint64, address), which the heartbeat decodes", () => {
    const seen = getAddress("0x00000000000000000000000000000000000000aa");
    const [at, who] = decodeAbiParameters([{ type: "uint64" }, { type: "address" }], encodeTick(1_800_000_000n, seen));
    expect(at).toBe(1_800_000_000n);
    expect(who).toBe(seen);
  });

  it("refuses a time that does not fit in 64 bits", () => {
    expect(() => encodeTick(2n ** 64n, "0x00000000000000000000000000000000000000aa")).toThrow();
  });
});
