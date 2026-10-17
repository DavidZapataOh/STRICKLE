import { type Address, type Hex, type PublicClient, parseAbiItem } from "viem";

export interface ContractRow {
  name: string;
  address: Address;
  deployed: boolean;
  verified: boolean | null;
}

/** Whether the explorer holds verified source for the address: true or false when it says so, null for anything else, never a guess. */
export async function explorerVerified(base: string, address: Address, fetchImpl: typeof fetch = fetch): Promise<boolean | null> {
  try {
    const response = await fetchImpl(`${base}/api/v2/smart-contracts/${address}`, { signal: AbortSignal.timeout(8_000) });
    if (!response.ok) return null;
    const body = (await response.json()) as { is_verified?: unknown } | null;
    return typeof body?.is_verified === "boolean" ? body.is_verified : null;
  } catch {
    return null;
  }
}

/** Every contract of the manifest: whether code is deployed at its address and whether its source is verified. A contract with no code is never reported verified, and one that cannot be read does not stop the others. */
export async function contractsReport(input: { manifest: Record<string, { address: Address }>; client: PublicClient; explorer: (address: Address) => Promise<boolean | null> }): Promise<ContractRow[]> {
  return Promise.all(
    Object.entries(input.manifest).map(async ([name, entry]): Promise<ContractRow> => {
      let deployed = false;
      try {
        const code = await input.client.getCode({ address: entry.address });
        deployed = typeof code === "string" && code !== "0x";
      } catch {
        deployed = false;
      }
      return { name, address: entry.address, deployed, verified: deployed ? await input.explorer(entry.address) : null };
    }),
  );
}

const stateUpdated = parseAbiItem("event StateUpdated(address indexed vault, uint64 indexed version, bytes ciphertext)");
const LOOKBACK = 50_000n;

/** When the agent last wrote to the chain: the newest update of the state contract in the recent past, or none. */
export async function agentActivity(client: PublicClient, state: Address): Promise<{ lastWriteAt: number | null; lastTx: Hex | null }> {
  try {
    const head = await client.getBlockNumber();
    const logs = await client.getLogs({ address: state, event: stateUpdated, fromBlock: head > LOOKBACK ? head - LOOKBACK : 0n, toBlock: head });
    const newest = [...logs].sort((a, b) => (a.blockNumber < b.blockNumber ? -1 : a.blockNumber > b.blockNumber ? 1 : 0)).at(-1);
    if (!newest) return { lastWriteAt: null, lastTx: null };
    const block = await client.getBlock({ blockNumber: newest.blockNumber });
    return { lastWriteAt: Number(block.timestamp), lastTx: newest.transactionHash as Hex };
  } catch {
    return { lastWriteAt: null, lastTx: null };
  }
}
