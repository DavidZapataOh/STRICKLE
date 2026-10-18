import { decodeAbiParameters } from "viem";
import { describe, expect, it } from "vitest";
import { encodeEarnReport } from "../enclave/reports.ts";

const VAULT = "0x8AB41267Adc223EF245c46537870Ae8744b9b3F8";
const EARN = "0xAabbeF1D3971c710276ed41eC791BbE14CdB8E88";
const input = { vault: VAULT, asset: 1, box: 5, earnVault: EARN, amount: 500_000_000n, minOut: 495_000_000_000_000_000_000n, seen: 4_000_000_000n, data: "0xaa3e079c01", next: 7n, ciphertext: "0xc1f7" } as const;

describe("encodeEarnReport", () => {
  it.each([
    [true, 7],
    [false, 8],
  ])("round-trips through the struct the executor decodes (deposit %s, action %i)", (deposit, action) => {
    const report = encodeEarnReport({ ...input, deposit });
    const [first, args] = decodeAbiParameters([{ type: "uint8" }, { type: "bytes" }], report);
    expect(first).toBe(action);
    const [decoded] = decodeAbiParameters(
      [
        {
          type: "tuple",
          components: [
            { name: "vault", type: "address" },
            { name: "asset", type: "uint8" },
            { name: "box", type: "uint8" },
            { name: "earnVault", type: "address" },
            { name: "amount", type: "uint256" },
            { name: "minOut", type: "uint256" },
            { name: "seen", type: "uint256" },
            { name: "data", type: "bytes" },
            { name: "next", type: "uint64" },
            { name: "ciphertext", type: "bytes" },
          ],
        },
      ],
      args,
    );
    expect(decoded).toEqual({ vault: VAULT, asset: 1, box: 5, earnVault: EARN, amount: 500_000_000n, minOut: 495_000_000_000_000_000_000n, seen: 4_000_000_000n, data: "0xaa3e079c01", next: 7n, ciphertext: "0xc1f7" });
  });
});
