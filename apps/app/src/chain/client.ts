import { type PublicClient, createPublicClient, http } from "viem";
import { appNetwork, networkInfo, rpcEndpoint } from "../config/network.ts";

let client: PublicClient | undefined;

/** One read client for the app: batching on, the endpoint and the chain taken from the network configuration. */
export function getPublicClient(): PublicClient {
  client ??= createPublicClient({ chain: networkInfo(appNetwork()).chain, transport: http(rpcEndpoint(), { batch: true }) }) as PublicClient;
  return client;
}
