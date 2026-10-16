import { type Address, getAddress, isAddress } from "viem";
import type { Deployments } from "../../../config/network.ts";
import type { LogKind } from "../../../chain/logs.ts";
import { ttlCache } from "./cache.ts";
import { rateLimit } from "./limit.ts";
import { PAGE_SIZE, buildUpstream } from "./upstream.ts";

export interface LogsDeps {
  explorerApi: string;
  apiKey?: string;
  deployments: Pick<Deployments, "BoxVaultFactory" | "AgentState" | "AgentExecutor">;
  isVault(vault: Address): Promise<boolean>;
  headBlock(): Promise<number>;
  now?: () => number;
  timeoutMs?: number;
}

const KINDS: readonly LogKind[] = ["notice", "allocated", "split", "salary"];
/** About 100 days of Arc blocks (half a second each); a vault's recent history, not its whole life. */
export const WINDOW_BLOCKS = 17_000_000;
const MAX_PAGES = 5;
const SHRINKS = [1, 4, 16];
const FRESH_SECONDS = 20;

type Entry = { blockNumber: string; logIndex: string; timeStamp: string; transactionHash: string; topics: (string | null)[]; data: string };

const unavailable = () => Response.json({ error: "unavailable" }, { status: 503, headers: { "cache-control": "no-store" } });

export function createLogsHandler(deps: LogsDeps): (request: Request) => Promise<Response> {
  const now = deps.now ?? Date.now;
  const answers = ttlCache<{ logs: Entry[]; truncated: boolean }>(FRESH_SECONDS * 1000, now);
  const verdicts = ttlCache<boolean>(60_000, now);
  const limiter = rateLimit(120, 60_000, now);
  const inflight = new Map<string, Promise<{ logs: Entry[]; truncated: boolean } | null>>();

  async function genuine(vault: Address): Promise<boolean> {
    const known = verdicts.get(vault);
    if (known !== undefined) return known;
    const verdict = await deps.isVault(vault).catch(() => false);
    verdicts.set(vault, verdict);
    return verdict;
  }

  async function page(kind: LogKind, vault: Address, fromBlock: number, number: number): Promise<Entry[] | null> {
    try {
      const response = await fetch(buildUpstream(kind, vault, deps.deployments, { base: deps.explorerApi, fromBlock, page: number, apiKey: deps.apiKey }), { signal: AbortSignal.timeout(deps.timeoutMs ?? 8_000) });
      if (!response.ok) return null;
      const body = (await response.json()) as { status?: string; result?: unknown };
      // "no logs found" arrives as status 0 with an empty list, which is a valid empty answer
      return Array.isArray(body.result) ? (body.result as Entry[]) : null;
    } catch {
      return null;
    }
  }

  async function collect(kind: LogKind, vault: Address): Promise<{ logs: Entry[]; truncated: boolean } | null> {
    const head = await deps.headBlock();
    for (const [attempt, divisor] of SHRINKS.entries()) {
      const fromBlock = Math.max(0, head - Math.floor(WINDOW_BLOCKS / divisor));
      const logs: Entry[] = [];
      let capped = true;
      for (let number = 1; number <= MAX_PAGES; number++) {
        const result = await page(kind, vault, fromBlock, number);
        if (result === null) return null;
        logs.push(...result);
        if (result.length < PAGE_SIZE) {
          capped = false;
          break;
        }
      }
      if (!capped) return { logs, truncated: attempt > 0 };
    }
    return null;
  }

  return async function GET(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const kind = url.searchParams.get("kind") as LogKind | null;
    const raw = url.searchParams.get("vault") ?? "";
    if (!kind || !KINDS.includes(kind) || !isAddress(raw, { strict: false })) return Response.json({ error: "bad request" }, { status: 400 });

    const who = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    const turn = limiter(who);
    if (!turn.allowed) return Response.json({ error: "slow down" }, { status: 429, headers: { "retry-after": String(turn.retryAfterSeconds), "cache-control": "no-store" } });

    const vault = getAddress(raw);
    if (!(await genuine(vault))) return Response.json({ error: "unknown vault" }, { status: 404, headers: { "cache-control": "public, max-age=60" } });

    const key = `${kind}:${vault}`;
    let answer = answers.get(key);
    if (!answer) {
      const running = inflight.get(key) ?? collect(kind, vault).finally(() => inflight.delete(key));
      inflight.set(key, running);
      const collected = await running.catch(() => null);
      if (!collected) return unavailable();
      answers.set(key, collected);
      answer = collected;
    }
    const shape = { logs: answer.logs.map((e) => ({ blockNumber: e.blockNumber, logIndex: e.logIndex, timeStamp: e.timeStamp, transactionHash: e.transactionHash, topics: e.topics, data: e.data })), truncated: answer.truncated };
    return Response.json(shape, { headers: { "cache-control": `public, s-maxage=${FRESH_SECONDS}, stale-while-revalidate=40` } });
  };
}
