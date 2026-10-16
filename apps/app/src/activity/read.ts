import type { Address, Hex, PublicClient } from "viem";
import { type LogKind, type RawLog, fetchLogsFrom } from "../chain/logs.ts";
import { deploymentsFor } from "../config/network.ts";
import { decodeActivity, spentFrom } from "./events.ts";
import type { Activity } from "./types.ts";

const isRateLimit = (error: unknown): boolean => {
  const text = String((error as { message?: string })?.message ?? error);
  return (error as { code?: number })?.code === -32005 || /rate limit|too many requests|429/i.test(text);
};

export async function withRetry<T>(work: () => Promise<T>, options: { tries?: number; baseMs?: number; sleep?: (ms: number) => Promise<void> } = {}): Promise<T> {
  const tries = options.tries ?? 5;
  const base = options.baseMs ?? 400;
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  for (let attempt = 1; ; attempt++) {
    try {
      return await work();
    } catch (error) {
      if (!isRateLimit(error) || attempt >= tries) throw error;
      await sleep(base * 2 ** (attempt - 1));
    }
  }
}

const KINDS = ["split", "salary", "private-spend", "allocated", "notice"] as const satisfies readonly LogKind[];

// The pool does not index the vault, so the public payment of a private spend is read from the receipt of that very transaction.
export async function readActivity(args: { client: PublicClient; vault: Address; fromBlock?: bigint; known?: Map<Hex, { amount: bigint; recipient: Address }>; signal?: AbortSignal }): Promise<Activity> {
  const { client, vault } = args;
  const fromBlock = args.fromBlock ?? 0n;
  const answers = await Promise.all(KINDS.map((kind) => fetchLogsFrom(kind, vault, { fromBlock, signal: args.signal })));
  const byKind = Object.fromEntries(KINDS.map((kind, index) => [kind, answers[index]?.logs ?? []])) as Record<(typeof KINDS)[number], RawLog[]>;

  const spent = args.known ?? new Map<Hex, { amount: bigint; recipient: Address }>();
  for (const log of byKind["private-spend"]) {
    if (spent.has(log.transactionHash)) continue;
    const receipt = await withRetry(() => client.getTransactionReceipt({ hash: log.transactionHash }));
    const paid = spentFrom(receipt.logs, deploymentsFor().PolicyPool);
    if (paid) spent.set(log.transactionHash, paid);
  }

  const decoded = decodeActivity({ executor: [...byKind.split, ...byKind.salary, ...byKind["private-spend"]], allocated: byKind.allocated, spent, state: byKind.notice });
  const blocks = [...decoded.receipts.map((item) => item.blockNumber), ...decoded.notices.map((item) => item.blockNumber), fromBlock];
  return { ...decoded, head: blocks.reduce((max, block) => (block > max ? block : max), 0n), truncated: answers.some((answer) => answer.truncated) };
}
