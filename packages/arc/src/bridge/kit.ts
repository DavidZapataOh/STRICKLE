import { createViemAdapterFromProvider } from "@circle-fin/adapter-viem-v2";
import { BridgeKit } from "@circle-fin/bridge-kit";
import { createPublicClient, http, type EIP1193Provider } from "viem";
import type { ArcNetworkName } from "../networks.ts";
import { sourceChainsFor } from "./chains.ts";

export type DepositKit = BridgeKit;
export type DepositAdapter = Awaited<ReturnType<typeof createViemAdapterFromProvider>>;

export const createDepositKit = (): DepositKit => new BridgeKit();

/** The kit's bundled Arc endpoint for testnet no longer resolves, and its source defaults are not ours to depend on: reads go through the registry's endpoints. */
export function adapterFromProvider(provider: EIP1193Provider, network: ArcNetworkName): Promise<DepositAdapter> {
  const rpc = new Map(sourceChainsFor(network).map((chain) => [chain.chainId, chain.rpc[0] as string]));
  return createViemAdapterFromProvider({
    provider,
    getPublicClient: ({ chain }) => createPublicClient({ chain, transport: http(rpc.get(chain.id) ?? chain.rpcUrls.default.http[0]) }),
  });
}
