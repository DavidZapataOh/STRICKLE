import { agentDeploymentsFor, appNetwork, networkInfo } from "../../../config/network.ts";
import { ttlCache } from "../logs/cache.ts";
import { explorerApiFor } from "../logs/upstream.ts";
import { POOL_PAGE_SIZE, buildPoolUpstream } from "./upstream.ts";

const answers = ttlCache<{ logs: unknown[]; hasMore: boolean }>(20_000);
const MAX_PAGE = 50;

const unavailable = () => Response.json({ error: "unavailable" }, { status: 503, headers: { "cache-control": "no-store" } });

export async function GET(request: Request): Promise<Response> {
  const page = Number(new URL(request.url).searchParams.get("page") ?? "1");
  if (!Number.isInteger(page) || page < 1 || page > MAX_PAGE) return Response.json({ error: "bad-page" }, { status: 400, headers: { "cache-control": "no-store" } });
  const cached = answers.get(String(page));
  if (cached) return Response.json(cached, { headers: { "cache-control": "public, max-age=10" } });
  try {
    const apiKey = process.env.BLOCKSCOUT_API_KEY || undefined;
    const info = networkInfo(appNetwork());
    const base = explorerApiFor(info.chain.id, info.explorerUrl, apiKey);
    const upstream = await fetch(buildPoolUpstream(agentDeploymentsFor().PolicyPool, apiKey, base, page), { signal: AbortSignal.timeout(8_000) });
    if (!upstream.ok) return unavailable();
    const body = (await upstream.json()) as { status?: string; result?: unknown };
    const result = Array.isArray(body.result) ? body.result : body.status === "0" ? [] : null;
    if (result === null) return unavailable();
    const logs = result.map((entry: Record<string, unknown>) => ({ blockNumber: entry.blockNumber, logIndex: entry.logIndex, timeStamp: entry.timeStamp, transactionHash: entry.transactionHash, topics: entry.topics, data: entry.data }));
    const answer = { logs, hasMore: logs.length === POOL_PAGE_SIZE };
    answers.set(String(page), answer);
    return Response.json(answer, { headers: { "cache-control": "public, max-age=10" } });
  } catch {
    return unavailable();
  }
}
