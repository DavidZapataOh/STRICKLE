import { BridgeKit } from "@circle-fin/bridge-kit";
import { getAddress } from "viem";
import { describe, expect, it } from "vitest";
import { ARC_DOMAIN, ARC_KIT_CHAIN, sourceChain, sourceChainsFor } from "../src/bridge/chains.ts";

const kit = new BridgeKit();
const definitions = new Map(kit.getSupportedChains().map((chain) => [chain.chain as string, chain]));

describe.each(["testnet", "mainnet"] as const)("the %s source chains", (network) => {
  it("each match the kit's own definition (id, chain id, CCTP domain, USDC, testnet flag)", () => {
    for (const entry of sourceChainsFor(network)) {
      const known = definitions.get(entry.id);
      expect(known, entry.id).toBeDefined();
      expect((known as { chainId?: number } | undefined)?.chainId, entry.id).toBe(entry.chainId);
      expect(known?.cctp?.domain, entry.id).toBe(entry.domain);
      expect(known?.isTestnet, entry.id).toBe(network === "testnet");
      expect(getAddress(known?.usdcAddress as string), entry.id).toBe(entry.usdc);
    }
  });

  it("only offers chains the kit can forward to Arc, and never Arc itself", () => {
    for (const entry of sourceChainsFor(network)) {
      expect(definitions.get(ARC_KIT_CHAIN[network])?.cctp?.forwarderSupported).toEqual({ source: false, destination: true });
      expect(entry.id.startsWith("Arc")).toBe(false);
    }
  });

  it("lists https endpoints and a checksummed USDC address", () => {
    for (const entry of sourceChainsFor(network)) {
      expect(entry.rpc.length).toBeGreaterThan(0);
      for (const url of entry.rpc) expect(url).toMatch(/^https:\/\//);
      expect(getAddress(entry.usdc)).toBe(entry.usdc);
    }
  });
});

describe("the registry", () => {
  it("knows Arc's CCTP domain and kit names", () => {
    expect(ARC_DOMAIN).toBe(26);
    expect(ARC_KIT_CHAIN).toEqual({ testnet: "Arc_Testnet", mainnet: "Arc" });
  });
  it("refuses a chain it does not list", () => {
    expect(() => sourceChain("testnet", "Ethereum")).toThrow(/not offered/);
    expect(sourceChain("testnet", "Base_Sepolia").label).toBe("Base");
  });
});
