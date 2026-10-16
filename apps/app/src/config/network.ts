import { type ArcNetwork, type ArcNetworkName, MODULAR_URL, networks } from "@strickle/arc/networks";
import generated from "../chain/deployments.generated.json" with { type: "json" };

export interface CoreDeployments {
  chainId: number;
  BoxVaultFactory: `0x${string}`;
}

export interface AgentDeployments {
  AgentState: `0x${string}`;
  AgentExecutor: `0x${string}`;
  PolicyPool: `0x${string}`;
  blocks: { AgentState: number; AgentExecutor: number };
}

export type Deployments = CoreDeployments & AgentDeployments;

type Generated = Record<
  string,
  { chainId: number; BoxVaultFactory: `0x${string}` | null; AgentState: `0x${string}` | null; AgentExecutor: `0x${string}` | null; PolicyPool: `0x${string}` | null; blocks: { AgentState: number; AgentExecutor: number } | null } | null
>;

/** The core contracts are required; the agent contracts exist only where an agent does (never on mainnet while CRE is testnet-only). */
export function resolveDeployments(generated: Generated, name: ArcNetworkName): { core: CoreDeployments; agent: AgentDeployments | null } {
  const found = generated[name];
  if (!found || !found.BoxVaultFactory) throw new Error(`the contracts are not deployed on ${name}`);
  const agent = found.AgentState && found.AgentExecutor && found.PolicyPool && found.blocks ? { AgentState: found.AgentState, AgentExecutor: found.AgentExecutor, PolicyPool: found.PolicyPool, blocks: found.blocks } : null;
  return { core: { chainId: found.chainId, BoxVaultFactory: found.BoxVaultFactory }, agent };
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

export const deploymentsFor = (name: ArcNetworkName = appNetwork()): CoreDeployments => resolveDeployments(generated as Generated, name).core;

export function agentDeploymentsFor(name: ArcNetworkName = appNetwork()): AgentDeployments {
  const { agent } = resolveDeployments(generated as Generated, name);
  if (!agent) throw new Error(`there is no agent on ${name}`);
  return agent;
}

export const executorFirstBlock = (name: ArcNetworkName = appNetwork()): bigint => BigInt(agentDeploymentsFor(name).blocks.AgentExecutor);

export function explorerLink(kind: "address" | "tx", value: string, name: ArcNetworkName = appNetwork()): string {
  return `${networks[name].explorerUrl}/${kind}/${value}`;
}

/** The origins the browser may connect to besides this app: Circle's wallet service and the network's RPC endpoint. They feed the Content Security Policy. */
export function connectOrigins(name: ArcNetworkName = appNetwork()): string[] {
  return [...new Set([new URL(MODULAR_URL).origin, new URL(rpcEndpoint(name)).origin])];
}
