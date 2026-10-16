import { getAddress } from "viem";
import { describe, expect, it } from "vitest";
import { sourceChainsFor, usdtChainsFor } from "../src/bridge/chains.ts";

describe("USDT in the source registry", () => {
  it("is offered on the six mainnet source chains and on no testnet chain", () => {
    expect(usdtChainsFor("mainnet").map((chain) => chain.id).sort()).toEqual(["Arbitrum", "Avalanche", "Base", "Ethereum", "Optimism", "Polygon"]);
    expect(usdtChainsFor("testnet")).toEqual([]);
  });

  it("carries a checksummed address per chain, distinct from the chain's USDC", () => {
    for (const chain of usdtChainsFor("mainnet")) {
      expect(getAddress(chain.usdt.address)).toBe(chain.usdt.address);
      expect(chain.usdt.address).not.toBe(chain.usdc);
    }
  });

  it("is a subset of the offered chains", () => {
    const offered = new Set(sourceChainsFor("mainnet").map((chain) => chain.id));
    for (const chain of usdtChainsFor("mainnet")) expect(offered.has(chain.id)).toBe(true);
  });
});
