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

  it.each(Object.values(networks))("$name lists a checksummed swap adapter", ({ swapAdapter }) => {
    expect(getAddress(swapAdapter)).toBe(swapAdapter);
  });

  it("uses a different swap adapter on each network", () => {
    expect(networks.testnet.swapAdapter).toBe("0xBBD70b01a1CAbc96d5b7b129Ae1AAabdf50dd40b");
    expect(networks.mainnet.swapAdapter).toBe("0x7FB8c7260b63934d8da38aF902f87ae6e284a845");
  });

  it("shares the USDC address across networks but not EURC", () => {
    expect(networks.testnet.usdc).toBe(networks.mainnet.usdc);
    expect(networks.testnet.eurc).not.toBe(networks.mainnet.eurc);
  });

  it("names the blockchains the Circle Wallets API expects", () => {
    expect(networks.testnet.circleBlockchain).toBe("ARC-TESTNET");
    expect(networks.mainnet.circleBlockchain).toBe("ARC");
  });

  it("defaults each network to an HTTPS endpoint that tolerates batches", () => {
    for (const name of ["testnet", "mainnet"] as const) {
      expect(networks[name].rpcUrl).toMatch(/^https:\/\//);
      expect(networks[name].rpcUrl).not.toBe(`https://rpc.${name}.arc.io`);
    }
    expect(networks.mainnet.rpcUrl).toBe("https://rpc.blockdaemon.mainnet.arc.io");
    expect(rpcUrl("mainnet", { ARC_MAINNET_RPC_URL: "https://override.example" })).toBe("https://override.example");
  });
});

describe("rpcUrl", () => {
  it("defaults to the public endpoint that tolerates batches", () => {
    expect(rpcUrl("testnet", {})).toBe("https://rpc.blockdaemon.testnet.arc.io");
  });

  it("prefers the environment override and ignores an empty value", () => {
    expect(rpcUrl("mainnet", { ARC_MAINNET_RPC_URL: "https://rpc.example" })).toBe("https://rpc.example");
    expect(rpcUrl("mainnet", { ARC_MAINNET_RPC_URL: "" })).toBe("https://rpc.blockdaemon.mainnet.arc.io");
  });
});

describe("the wallet service endpoint", () => {
  it("is one constant shared by the passkey wallet and the apps' content security policy", async () => {
    const { MODULAR_URL } = await import("../src/networks.ts");
    expect(new URL(MODULAR_URL).origin).toBe("https://modular-sdk.circle.com");
  });
});
