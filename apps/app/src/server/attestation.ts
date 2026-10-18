import { type Address, type Hex, type PublicClient, concatHex, decodeFunctionData, hexToBytes, keccak256, parseAbi, recoverAddress, toHex } from "viem";

/** The Capability Registry on Ethereum, where the DON's signers and its fault tolerance are written. */
export const CAPABILITY_REGISTRY = "0x76c9cf548b4179F8901cda1f8623568b58215E62" as const;
const HEADER_LENGTH = 109;

/** The 109-byte header of a report: which DON signed it, for which workflow and by whom it was deployed. */
export function parseHeader(raw: Uint8Array): { donId: number; workflowId: Hex; workflowOwner: Hex; body: Uint8Array } {
  if (raw.length < HEADER_LENGTH) throw new Error(`the report is too short: ${raw.length} bytes`);
  const view = new DataView(raw.buffer, raw.byteOffset);
  return { donId: view.getUint32(37, false), workflowId: toHex(raw.slice(45, 77)), workflowOwner: toHex(raw.slice(87, 107)), body: raw.slice(HEADER_LENGTH) };
}

/** `keccak256(keccak256(rawReport) || reportContext)`, the hash the DON's nodes sign. */
export const reportHash = (raw: Uint8Array, context: Uint8Array): Hex => keccak256(concatHex([keccak256(toHex(raw)), toHex(context)]));

const slot = (bytes: Uint8Array, offset: number): number => new DataView(bytes.buffer, bytes.byteOffset + offset + 28, 4).getUint32(0, false);

/** The fault tolerance and the authorized signers of a DON, read from the registry as the documentation lays the answer out. Addresses are lower case, with no prefix. */
export async function registrySigners(client: PublicClient, donId: number): Promise<{ f: number; signers: Set<string> }> {
  const padded = new Uint8Array(32);
  new DataView(padded.buffer).setUint32(28, donId, false);
  const don = await client.call({ to: CAPABILITY_REGISTRY, data: concatHex(["0x23537405", toHex(padded)]) });
  if (!don.data) throw new Error("the registry gave no answer for the DON");
  const bytes = hexToBytes(don.data);
  if (bytes.length < 224) throw new Error("the registry's answer for the DON is too short");
  const f = slot(bytes, 96);
  const countOffset = 32 + slot(bytes, 192);
  const count = slot(bytes, countOffset);
  if (count === 0) return { f, signers: new Set() };
  const ids: Hex[] = [];
  for (let i = 0; i < count; i += 1) ids.push(toHex(bytes.slice(countOffset + 32 + i * 32, countOffset + 64 + i * 32)));

  const pointer = new Uint8Array(32);
  new DataView(pointer.buffer).setUint32(28, 32, false);
  const length = new Uint8Array(32);
  new DataView(length.buffer).setUint32(28, count, false);
  const nodes = await client.call({ to: CAPABILITY_REGISTRY, data: concatHex(["0x05a51966", toHex(pointer), toHex(length), ...ids]) });
  if (!nodes.data) throw new Error("the registry gave no nodes");
  const reply = hexToBytes(nodes.data);
  if (reply.length < 64) throw new Error("the registry's answer for the nodes is too short");
  const outer = slot(reply, 0);
  const returned = slot(reply, outer);
  const signers = new Set<string>();
  for (let i = 0; i < returned; i += 1) {
    const base = outer + 32 + slot(reply, outer + 32 + i * 32);
    if (base + 288 > reply.length) break;
    signers.add(toHex(reply.slice(base + 96, base + 116)).slice(2).toLowerCase());
  }
  return { f, signers };
}

/** How many distinct authorized nodes signed this exact report, against the threshold f + 1. A signature that is malformed, from a stranger or repeated counts for nothing more. */
export async function verifyReport(input: { raw: Uint8Array; context: Uint8Array; signatures: readonly Hex[]; signers: ReadonlySet<string>; f: number }): Promise<{ valid: number; threshold: number; ok: boolean }> {
  const hash = reportHash(input.raw, input.context);
  const counted = new Set<string>();
  for (const signature of input.signatures) {
    const bytes = hexToBytes(signature);
    if (bytes.length !== 65) continue;
    const normalized = new Uint8Array(bytes);
    if ((normalized[64] ?? 0) >= 27) normalized[64] = (normalized[64] ?? 0) - 27;
    try {
      const recovered = (await recoverAddress({ hash, signature: toHex(normalized) })).toLowerCase().slice(2);
      if (input.signers.has(recovered)) counted.add(recovered);
    } catch {
      // a malformed signature counts for nothing
    }
  }
  const threshold = input.f + 1;
  return { valid: counted.size, threshold, ok: counted.size >= threshold };
}

const forwarderAbi = parseAbi(["function report(address receiver, bytes rawReport, bytes reportContext, bytes[] signatures)"]);
const LOOKBACK = 50_000n;
const NEWEST = 8;

export interface DeliveredReport {
  tx: Hex;
  receiver: Address;
  raw: Uint8Array;
  context: Uint8Array;
  signatures: Hex[];
  at: number;
}

/** The newest report the forwarder delivered to any of the agent's receivers, found through those contracts' own events (any event a report makes them emit), skipping any transaction that is not a forwarder report. */
export async function latestReport(client: PublicClient, receivers: readonly Address[], forwarder: Address): Promise<DeliveredReport | null> {
  try {
    const head = await client.getBlockNumber();
    const logs = await client.getLogs({ address: [...receivers], fromBlock: head > LOOKBACK ? head - LOOKBACK : 0n, toBlock: head });
    const seen = new Set<string>();
    const newest = [...logs]
      .sort((a, b) => (a.blockNumber < b.blockNumber ? 1 : a.blockNumber > b.blockNumber ? -1 : 0))
      .filter((log) => (seen.has(log.transactionHash as string) ? false : (seen.add(log.transactionHash as string), true)))
      .slice(0, NEWEST);
    for (const log of newest) {
      const tx = await client.getTransaction({ hash: log.transactionHash as Hex });
      if (!tx.to || tx.to.toLowerCase() !== forwarder.toLowerCase()) continue;
      try {
        const decoded = decodeFunctionData({ abi: forwarderAbi, data: tx.input });
        const [receiver, raw, context, signatures] = decoded.args;
        const block = await client.getBlock({ blockNumber: log.blockNumber });
        return { tx: log.transactionHash as Hex, receiver, raw: hexToBytes(raw), context: hexToBytes(context), signatures: [...signatures], at: Number(block.timestamp) };
      } catch {
        // not a forwarder report: try the next newest
      }
    }
    return null;
  } catch {
    return null;
  }
}
