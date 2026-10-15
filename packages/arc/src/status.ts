import { type Address, createPublicClient, erc20Abi, formatUnits, http } from "viem";
import { type ArcNetworkName, networks, rpcUrl } from "./networks.ts";

export async function networkStatus(
  name: ArcNetworkName,
  address: Address,
  env: Record<string, string | undefined> = process.env,
) {
  const network = networks[name];
  const client = createPublicClient({ chain: network.chain, transport: http(rpcUrl(name, env)) });
  const [blockNumber, balance] = await Promise.all([
    client.getBlockNumber(),
    client.readContract({ address: network.usdc, abi: erc20Abi, functionName: "balanceOf", args: [address] }),
  ]);
  return { network: name, chainId: network.chain.id, blockNumber, usdc: formatUnits(balance, 6) };
}
