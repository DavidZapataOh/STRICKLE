// workflows/agent/tick.ts
import { type Address, type Hex, encodeAbiParameters, parseAbi } from "viem";

export const factoryAbi = parseAbi(["function implementation() view returns (address)"]);

const UINT64_MAX = 2n ** 64n - 1n;

export function encodeTick(tickedAt: bigint, seen: Address): Hex {
  if (tickedAt < 0n || tickedAt > UINT64_MAX) throw new Error("tick time does not fit in uint64");
  return encodeAbiParameters([{ type: "uint64" }, { type: "address" }], [tickedAt, seen]);
}
