import type { Rate } from "@strickle/core";
import { type Address, type Hex, decodeFunctionResult, encodeFunctionData, parseAbi } from "viem";
import { type RpcRequest, callRequest } from "./rpc.ts";

const feedAbi = parseAbi(["function latestRoundData() view returns (uint80, int256, uint256, uint256, uint80)"]);

export const feedRequests = (usdcFeed: Address, eurcFeed: Address): RpcRequest[] =>
  [usdcFeed, eurcFeed].map((feed) => callRequest(feed, encodeFunctionData({ abi: feedAbi, functionName: "latestRoundData" }), "latest"));

/** The two answers as a rate, or "stale" when either is older than the limit or stamped in the future; a non-positive answer is a broken feed and throws. */
export function decodeRate(answers: unknown[], now: number, maxAgeSeconds: number): Rate | "stale" {
  const [usdc, eurc] = answers.map((answer) => decodeFunctionResult({ abi: feedAbi, functionName: "latestRoundData", data: answer as Hex }));
  if (!usdc || !eurc) throw new Error("two feed answers are needed");
  if (usdc[1] <= 0n || eurc[1] <= 0n) throw new Error("a feed answered zero or less");
  for (const round of [usdc, eurc]) {
    const updatedAt = Number(round[3]);
    if (updatedAt > now || now - updatedAt > maxAgeSeconds) return "stale";
  }
  return { usdcUsd: usdc[1], eurcUsd: eurc[1] };
}
