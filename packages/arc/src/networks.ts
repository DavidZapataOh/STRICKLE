import type { Address, Chain } from "viem";
import { arc, arcTestnet } from "viem/chains";

export type ArcNetworkName = "testnet" | "mainnet";

export interface ArcNetwork {
  readonly name: ArcNetworkName;
  readonly chain: Chain;
  readonly rpcUrl: string;
  readonly explorerUrl: string;
  readonly circleBlockchain: "ARC" | "ARC-TESTNET";
  readonly usdc: Address;
  readonly eurc: Address;
}

// Arc silently drops transactions priced below this floor.
export const MIN_FEE_PER_GAS = 20_000_000_000n;

export const networks = {
  testnet: {
    name: "testnet",
    chain: arcTestnet,
    rpcUrl: "https://rpc.blockdaemon.testnet.arc.network",
    explorerUrl: "https://explorer.testnet.arc.io",
    circleBlockchain: "ARC-TESTNET",
    usdc: "0x3600000000000000000000000000000000000000",
    eurc: "0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a",
  },
  mainnet: {
    name: "mainnet",
    chain: arc,
    rpcUrl: "https://rpc.blockdaemon.mainnet.arc.io",
    explorerUrl: "https://explorer.arc.io",
    circleBlockchain: "ARC",
    usdc: "0x3600000000000000000000000000000000000000",
    eurc: "0xbEf5f6d51CB62b58e6A8f77868681825C6fe21c1",
  },
} as const satisfies Record<ArcNetworkName, ArcNetwork>;

export function rpcUrl(
  name: ArcNetworkName,
  env: Record<string, string | undefined> = process.env,
): string {
  return env[`ARC_${name.toUpperCase()}_RPC_URL`] || networks[name].rpcUrl;
}

/** Circle's modular wallet service, which a passkey wallet talks to from the browser. */
export const MODULAR_URL = "https://modular-sdk.circle.com/v1/rpc/w3s/buidl";
