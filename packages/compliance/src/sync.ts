import { type Account, type Address, type Chain, type Hex, type PublicClient, type Transport, type WalletClient, keccak256, parseAbi, toBytes } from "viem";

export const screeningAbi = parseAbi([
  "function setRisks(address[] who, uint8[] risks, bytes32 evidence)",
  "function recordOf(address who) view returns (uint8 risk, uint64 screenedAt, bytes32 evidence)",
  "function status(address who) view returns (uint8 risk, bool fresh)",
  "function ttl() view returns (uint64)",
]);

const canonical = (value: unknown): unknown =>
  Array.isArray(value)
    ? value.map(canonical)
    : value !== null && typeof value === "object"
      ? Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : 1)).map(([key, item]) => [key, canonical(item)]))
      : typeof value === "bigint"
        ? value.toString()
        : value;

/** The 32-byte digest stored with every screening record: keccak256 of the report as canonical JSON. */
export const evidenceHash = (report: unknown): Hex => keccak256(toBytes(JSON.stringify(canonical(report))));

export interface SyncArgs<C extends Chain | undefined = Chain | undefined> {
  publicClient: PublicClient<Transport, C>;
  walletClient: WalletClient<Transport, C, Account>;
  registry: Address;
  desired: Map<Address, 0 | 1 | 2>;
  evidence: Hex;
  /** Records closer than this many seconds to expiry are rewritten even if their tier is right. Default: a quarter of the TTL. */
  refreshMargin?: number;
  /** At most 200 per transaction (the registry's limit). */
  batch?: number;
  /** Fee fields for chains that drop transactions priced below a floor (Arc does). */
  fees?: { maxFeePerGas: bigint; maxPriorityFeePerGas?: bigint };
}

/** Writes only what changed or is about to lapse, so the registry stays current without paying for every address every time. */
export async function syncScreening<C extends Chain | undefined>(args: SyncArgs<C>): Promise<{ written: number; skipped: number }> {
  const { publicClient, walletClient, registry, desired } = args;
  const batch = Math.min(args.batch ?? 200, 200);
  if (desired.size === 0) return { written: 0, skipped: 0 };
  const ttl = Number(await publicClient.readContract({ address: registry, abi: screeningAbi, functionName: "ttl" }));
  const margin = args.refreshMargin ?? Math.floor(ttl / 4);
  const now = Number((await publicClient.getBlock()).timestamp);

  const entries = [...desired.entries()];
  const pending: [Address, 0 | 1 | 2][] = [];
  for (let i = 0; i < entries.length; i += 50) {
    const slice = entries.slice(i, i + 50);
    const records = await Promise.all(slice.map(([address]) => publicClient.readContract({ address: registry, abi: screeningAbi, functionName: "recordOf", args: [address] })));
    slice.forEach(([address, risk], j) => {
      const [currentRisk, screenedAt] = records[j] as readonly [number, bigint, Hex];
      const expiresIn = Number(screenedAt) + ttl - now;
      if (currentRisk !== risk || expiresIn <= margin) pending.push([address, risk]);
    });
  }

  for (let i = 0; i < pending.length; i += batch) {
    const slice = pending.slice(i, i + batch);
    const hash = await walletClient.writeContract({
      address: registry,
      abi: screeningAbi,
      functionName: "setRisks",
      args: [slice.map(([address]) => address), slice.map(([, risk]) => risk), args.evidence],
      ...args.fees,
    } as never);
    await publicClient.waitForTransactionReceipt({ hash });
  }
  return { written: pending.length, skipped: entries.length - pending.length };
}
