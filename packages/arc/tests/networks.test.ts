import { getAddress } from "viem";
import { describe, expect, it } from "vitest";
import { networks, rpcUrl } from "../src/networks.ts";

describe("networks", () => {
  it("uses the chain ids published by Arc", () => {
    expect(networks.testnet.chain.id).toBe(5042002);
    expect(networks.mainnet.chain.id).toBe(5042);
  });

  it.each(Object.values(networks))("$name lists checksummed token addresses", ({ usdc, eurc }) => {
    expect(getAddress(usdc)).toBe(usdc);
    expect(getAddress(eurc)).toBe(eurc);
  });

  it("shares the USDC address across networks but not EURC", () => {
    expect(networks.testnet.usdc).toBe(networks.mainnet.usdc);
    expect(networks.testnet.eurc).not.toBe(networks.mainnet.eurc);
  });

  it("names the blockchains the Circle Wallets API expects", () => {
    expect(networks.testnet.circleBlockchain).toBe("ARC-TESTNET");
    expect(networks.mainnet.circleBlockchain).toBe("ARC");
  });
});

describe("rpcUrl", () => {
  it("defaults to the primary public endpoint", () => {
    expect(rpcUrl("testnet", {})).toBe("https://rpc.testnet.arc.io");
  });

  it("prefers the environment override and ignores an empty value", () => {
    expect(rpcUrl("mainnet", { ARC_MAINNET_RPC_URL: "https://rpc.example" })).toBe("https://rpc.example");
    expect(rpcUrl("mainnet", { ARC_MAINNET_RPC_URL: "" })).toBe("https://rpc.mainnet.arc.io");
  });
});
