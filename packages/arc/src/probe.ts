import { type Address, isAddress, pad } from "viem";
import { type ArcNetworkName, networks, rpcUrl } from "./networks.ts";

export type RpcCall = (method: string, params?: unknown[]) => Promise<unknown>;

export interface NetworkProbe {
  network: ArcNetworkName;
  chainId: number;
  blockNumber: bigint;
  usdcCodeBytes: number;
  eurcCodeBytes: number;
}

export function httpCall(url: string): RpcCall {
  return async (method, params = []) => {
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    });
    if (!response.ok) throw new Error(`rpc ${method} answered HTTP ${response.status}`);
    const body = (await response.json()) as { result?: unknown; error?: { message?: string } };
    if (body.error) throw new Error(`rpc ${method} failed: ${body.error.message ?? "unknown error"}`);
    return body.result;
  };
}

const codeBytes = (code: unknown): number => (typeof code === "string" && code.startsWith("0x") ? (code.length - 2) / 2 : 0);

export async function probeNetwork(
  name: ArcNetworkName,
  options: { call?: RpcCall; env?: Record<string, string | undefined> } = {},
): Promise<NetworkProbe> {
  const network = networks[name];
  const call = options.call ?? httpCall(rpcUrl(name, options.env));
  const chainId = Number(BigInt((await call("eth_chainId")) as string));
  if (chainId !== network.chain.id) {
    throw new Error(`chain id mismatch on ${name}: expected ${network.chain.id}, the endpoint answered ${chainId}`);
  }
  const blockNumber = BigInt((await call("eth_blockNumber")) as string);
  const [usdc, eurc] = await Promise.all([network.usdc, network.eurc].map((token) => call("eth_getCode", [token, "latest"])));
  const usdcCodeBytes = codeBytes(usdc);
  const eurcCodeBytes = codeBytes(eurc);
  if (usdcCodeBytes === 0) throw new Error(`USDC has no code at ${network.usdc} on ${name}`);
  if (eurcCodeBytes === 0) throw new Error(`EURC has no code at ${network.eurc} on ${name}`);
  return { network: name, chainId, blockNumber, usdcCodeBytes, eurcCodeBytes };
}

const BALANCE_OF = "0x70a08231";

/** The ERC-20 balance in six-decimal base units. Arc's native balance has 18 decimals and must never stand in for it. */
export async function usdcBalance(name: ArcNetworkName, address: string, options: { call?: RpcCall; env?: Record<string, string | undefined> } = {}): Promise<bigint> {
  if (!isAddress(address, { strict: false })) throw new Error(`not an address: ${address}`);
  const call = options.call ?? httpCall(rpcUrl(name, options.env));
  const data = `${BALANCE_OF}${pad(address as Address, { size: 32 }).slice(2)}`;
  const answer = await call("eth_call", [{ to: networks[name].usdc, data }, "latest"]);
  if (typeof answer !== "string" || answer === "0x") throw new Error(`balanceOf returned no data on ${name}`);
  return BigInt(answer);
}
