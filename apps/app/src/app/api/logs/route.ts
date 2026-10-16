import { type Address, getAddress } from "viem";
import { factoryAbi } from "../../../chain/abi.ts";
import { getPublicClient } from "../../../chain/client.ts";
import { vaultReadAbi } from "../../../chain/read-abi.ts";
import { agentDeploymentsFor, appNetwork, deploymentsFor, networkInfo } from "../../../config/network.ts";
import { createLogsHandler } from "./handler.ts";
import { explorerApiFor } from "./upstream.ts";

let handle: ((request: Request) => Promise<Response>) | undefined;

// Built on first use: a build for a network whose contracts are not deployed yet must still compile, and the route then answers "unavailable".
function build() {
  const network = appNetwork();
  const deployments = { ...deploymentsFor(network), ...agentDeploymentsFor(network) };
  const apiKey = process.env.BLOCKSCOUT_API_KEY || undefined;
  const info = networkInfo(network);
  return createLogsHandler({
    explorerApi: explorerApiFor(info.chain.id, info.explorerUrl, apiKey),
    apiKey,
    deployments,
    headBlock: async () => Number(await getPublicClient().getBlockNumber()),
    // A genuine vault is the one its owner's factory created: anything else is refused before it can cost an explorer request.
    isVault: async (vault: Address) => {
      const client = getPublicClient();
      const owner = await client.readContract({ address: vault, abi: vaultReadAbi, functionName: "owner" });
      const expected = await client.readContract({ address: deployments.BoxVaultFactory, abi: factoryAbi, functionName: "vaultOf", args: [owner] });
      return getAddress(expected) === vault;
    },
  });
}

export async function GET(request: Request): Promise<Response> {
  try {
    handle ??= build();
  } catch {
    return Response.json({ error: "unavailable" }, { status: 503, headers: { "cache-control": "no-store" } });
  }
  return handle(request);
}
