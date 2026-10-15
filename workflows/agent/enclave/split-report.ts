// workflows/agent/enclave/split-report.ts
import { type Address, type Hex, encodeAbiParameters } from "viem";

const SPLIT = 1;

export function encodeSplitReport(input: { vault: Address; asset: number; seen: bigint; boxes: number[]; amounts: bigint[]; next: bigint; ciphertext: Hex }): Hex {
  if (input.boxes.length !== input.amounts.length) throw new Error("boxes and amounts differ in length");
  const args = encodeAbiParameters(
    [{ type: "address" }, { type: "uint8" }, { type: "uint256" }, { type: "uint8[]" }, { type: "uint256[]" }, { type: "uint64" }, { type: "bytes" }],
    [input.vault, input.asset, input.seen, input.boxes, input.amounts, input.next, input.ciphertext],
  );
  return encodeAbiParameters([{ type: "uint8" }, { type: "bytes" }], [SPLIT, args]);
}
