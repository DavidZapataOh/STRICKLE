import { type Address, type Hex, decodeEventLog } from "viem";
import { events } from "./read-abi.ts";

export type LogKind = "notice" | "allocated" | "split" | "salary";
export interface RawLog {
  blockNumber: bigint;
  logIndex: number;
  timestamp: number;
  transactionHash: Hex;
  topics: Hex[];
  data: Hex;
}
/** `truncated` means older entries exist that this answer does not carry. */
export interface LogPage {
  logs: RawLog[];
  truncated: boolean;
}

const hex = (value: unknown, label: string): string => {
  if (typeof value !== "string" || !/^0x[0-9a-fA-F]*$/.test(value)) throw new Error(`bad ${label}`);
  return value;
};

export function parseLogsResponse(json: unknown): LogPage {
  const body = json as { logs?: unknown; truncated?: unknown } | null;
  if (!body || !Array.isArray(body.logs)) throw new Error("no logs field");
  const logs = body.logs.map((entry: Record<string, unknown>) => {
    const hash = hex(entry.transactionHash, "transactionHash");
    if (hash.length !== 66) throw new Error("bad transactionHash");
    if (!Array.isArray(entry.topics)) throw new Error("bad topics");
    return {
      blockNumber: BigInt(hex(entry.blockNumber, "blockNumber")),
      logIndex: Number(BigInt(hex(entry.logIndex, "logIndex"))),
      timestamp: Number(BigInt(hex(entry.timeStamp, "timeStamp"))),
      transactionHash: hash as Hex,
      topics: entry.topics.filter((topic: unknown) => topic !== null).map((topic: unknown) => hex(topic, "topic") as Hex),
      data: hex(entry.data, "data") as Hex,
    };
  });
  return { logs, truncated: body.truncated === true };
}

export async function fetchLogs(kind: LogKind, vault: Address, signal?: AbortSignal): Promise<LogPage> {
  const response = await fetch(`/api/logs?kind=${kind}&vault=${vault}`, { signal });
  if (!response.ok) throw new Error("activity unavailable");
  return parseLogsResponse(await response.json());
}

export function decodeAllocated(log: RawLog): { asset: number; box: number; amount: bigint; newBalance: bigint } {
  const { args } = decodeEventLog({ abi: [events.allocated], data: log.data, topics: log.topics as [Hex, ...Hex[]] });
  return { asset: Number(args.asset), box: Number(args.box), amount: args.amount, newBalance: args.newBalance };
}
