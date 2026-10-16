import { type ArcNetwork, type ArcNetworkName, MODULAR_URL, networks } from "@strickle/arc/networks";
import generated from "../chain/deployments.generated.json" with { type: "json" };

export interface Deployments {
  chainId: number;
  BoxVaultFactory: `0x${string}`;
  AgentState: `0x${string}`;
  AgentExecutor: `0x${string}`;
}

export function resolveNetwork(value: string | undefined): ArcNetworkName {
  const name = value ?? "testnet";
  if (name !== "testnet" && name !== "mainnet") throw new Error(`NEXT_PUBLIC_APP_NETWORK must be testnet or mainnet, not "${name}"`);
  return name;
}

/** The one network this build talks to. Next only inlines a `NEXT_PUBLIC_*` variable that is written out in full, so it is read here, once. */
export const appNetwork = (): ArcNetworkName => resolveNetwork(process.env.NEXT_PUBLIC_APP_NETWORK);

export const networkInfo = (name: ArcNetworkName = appNetwork()): ArcNetwork => networks[name];

/** `override` is `NEXT_PUBLIC_ARC_RPC_URL`; without it the endpoint `@strickle/arc` publishes for the network. */
export function resolveRpc(name: ArcNetworkName, override: string | undefined): string {
  return override && /^https:\/\//.test(override) ? override : networks[name].rpcUrl;
}

export const rpcEndpoint = (name: ArcNetworkName = appNetwork()): string => resolveRpc(name, process.env.NEXT_PUBLIC_ARC_RPC_URL);

export function deploymentsFor(name: ArcNetworkName = appNetwork()): Deployments {
  const found = (generated as Record<string, Deployments | null>)[name];
  if (!found) throw new Error(`the contracts are not deployed on ${name}`);
  return found;
}

export function explorerLink(kind: "address" | "tx", value: string, name: ArcNetworkName = appNetwork()): string {
  return `${networks[name].explorerUrl}/${kind}/${value}`;
}

/** The origins the browser may connect to besides this app: Circle's wallet service and the network's RPC endpoint. They feed the Content Security Policy. */
export function connectOrigins(name: ArcNetworkName = appNetwork()): string[] {
  return [...new Set([new URL(MODULAR_URL).origin, new URL(rpcEndpoint(name)).origin])];
}
