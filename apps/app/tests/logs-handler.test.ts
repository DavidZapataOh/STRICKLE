import { type Server, createServer } from "node:http";
import { type AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createLogsHandler } from "../src/app/api/logs/handler.ts";

const deployments = { chainId: 5042002, BoxVaultFactory: "0x00000000000000000000000000000000000000f1", AgentState: "0x00000000000000000000000000000000000000f2", AgentExecutor: "0x00000000000000000000000000000000000000f3" } as const;
const vault = "0x00000000000000000000000000000000000000a1";
const stranger = "0x00000000000000000000000000000000000000c3";

// A real HTTP server speaking the explorer's log protocol over an in-memory list, so every case below goes over a socket.
let server: Server;
let base: string;
let entries: { blockNumber: string; logIndex: string; timeStamp: string; transactionHash: string; topics: string[]; data: string }[] = [];
let hits: URL[] = [];
let mode: "ok" | "limited" | "broken" | "slow" = "ok";

const entry = (block: number) => ({ blockNumber: `0x${block.toString(16)}`, logIndex: "0x1", timeStamp: "0x6ad17bb2", transactionHash: `0x${block.toString(16).padStart(64, "0")}`, topics: [`0x${"11".repeat(32)}`], data: "0x00" });

beforeEach(async () => {
  hits = [];
  mode = "ok";
  entries = [];
  server = createServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://localhost");
    hits.push(url);
    if (mode === "slow") return;
    if (mode === "limited") {
      response.writeHead(429).end(JSON.stringify({ message: "Too many requests", result: null, status: "0" }));
      return;
    }
    if (mode === "broken") {
      response.writeHead(200).end("<html>not json</html>");
      return;
    }
    const from = Number(url.searchParams.get("fromBlock"));
    const size = Number(url.searchParams.get("offset"));
    const page = Number(url.searchParams.get("page"));
    const matching = entries.filter((e) => Number.parseInt(e.blockNumber, 16) >= from);
    const slice = matching.slice((page - 1) * size, page * size);
    response.writeHead(200).end(JSON.stringify({ message: slice.length ? "OK" : "No logs found", result: slice, status: slice.length ? "1" : "0" }));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
});
afterEach(() => new Promise<void>((resolve) => server.close(() => resolve())));

const handler = (patch: Partial<Parameters<typeof createLogsHandler>[0]> = {}) =>
  createLogsHandler({ explorerApi: base, apiKey: "SECRET-KEY-123", deployments, isVault: async (address) => address.toLowerCase() === vault, headBlock: async () => 100_000_000, timeoutMs: 300, ...patch });
const ask = (h: ReturnType<typeof handler>, query: string, ip = "1.1.1.1") => h(new Request(`http://app.test/api/logs?${query}`, { headers: { "x-forwarded-for": ip } }));

describe("GET /api/logs", () => {
  it("answers with the explorer's logs, shares them through the CDN and sends the key only upstream", async () => {
    entries = [entry(99_999_990), entry(99_999_991)];
    const response = await ask(handler(), `kind=allocated&vault=${vault}`);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("s-maxage=20");
    const text = await response.text();
    expect(JSON.parse(text)).toMatchObject({ truncated: false, logs: [{ blockNumber: "0x5f5e0f6" }, { blockNumber: "0x5f5e0f7" }] });
    expect(text).not.toContain("SECRET-KEY-123");
    expect(hits[0]?.searchParams.get("apikey")).toBe("SECRET-KEY-123");
  });

  it("asks only for the recent window", async () => {
    await ask(handler(), `kind=notice&vault=${vault}`);
    expect(Number(hits[0]?.searchParams.get("fromBlock"))).toBe(100_000_000 - 17_000_000);
  });

  it("answers an empty vault with an empty list", async () => {
    const response = await ask(handler(), `kind=split&vault=${vault}`);
    expect(await response.json()).toEqual({ logs: [], truncated: false });
  });

  it("serves a repeated question from memory and shares one upstream call between simultaneous ones", async () => {
    entries = [entry(99_999_990)];
    const h = handler();
    await Promise.all([ask(h, `kind=allocated&vault=${vault}`, "2.2.2.2"), ask(h, `kind=allocated&vault=${vault}`, "3.3.3.3")]);
    await ask(h, `kind=allocated&vault=${vault}`, "4.4.4.4");
    expect(hits).toHaveLength(1);
  });

  it("reads every page until a short one and keeps the newest", async () => {
    entries = Array.from({ length: 2_300 }, (_, i) => entry(90_000_000 + i));
    const body = (await (await ask(handler(), `kind=allocated&vault=${vault}`)).json()) as { logs: { blockNumber: string }[]; truncated: boolean };
    expect(body.logs).toHaveLength(2_300);
    expect(body.logs.at(-1)?.blockNumber).toBe(`0x${(90_000_000 + 2_299).toString(16)}`);
    expect(hits).toHaveLength(3);
  });

  it("narrows the window instead of giving up when the first one holds too many entries, and says it is partial", async () => {
    entries = Array.from({ length: 6_000 }, (_, i) => entry(86_000_000 + i * 2_000));
    const body = (await (await ask(handler(), `kind=allocated&vault=${vault}`)).json()) as { logs: unknown[]; truncated: boolean };
    expect(body.truncated).toBe(true);
    expect(body.logs.length).toBeGreaterThan(0);
    expect(body.logs.length).toBeLessThan(6_000);
  });

  it.each([["rate limited", "limited"], ["not json", "broken"]] as const)("answers 503 when the explorer is %s, with no upstream detail and no key", async (_name, which) => {
    mode = which;
    const response = await ask(handler(), `kind=allocated&vault=${vault}`);
    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const text = await response.text();
    expect(text).toBe(JSON.stringify({ error: "unavailable" }));
  });

  it("answers 503 when the explorer is too slow", async () => {
    mode = "slow";
    expect((await ask(handler(), `kind=allocated&vault=${vault}`)).status).toBe(503);
  });

  it("answers 503, not an exception, when the chain head cannot be read", async () => {
    const response = await ask(handler({ headBlock: async () => { throw new Error("rpc down"); } }), `kind=allocated&vault=${vault}`);
    expect(response.status).toBe(503);
  });

  it("refuses unknown shapes and addresses that are not genuine vaults, without touching the explorer", async () => {
    const h = handler();
    expect((await ask(h, `kind=everything&vault=${vault}`)).status).toBe(400);
    expect((await ask(h, "kind=notice&vault=nope")).status).toBe(400);
    expect((await ask(h, "kind=notice")).status).toBe(400);
    expect((await ask(h, `kind=notice&vault=${stranger}`)).status).toBe(404);
    expect((await ask(handler({ isVault: async () => { throw new Error("rpc down"); } }), `kind=notice&vault=${vault}`)).status).toBe(404);
    expect(hits).toHaveLength(0);
  });

  it("slows a caller who asks too often and lets others through", async () => {
    entries = [entry(99_999_990)];
    const h = handler();
    for (let i = 0; i < 120; i++) await ask(h, `kind=allocated&vault=${vault}`, "9.9.9.9");
    const slow = await ask(h, `kind=allocated&vault=${vault}`, "9.9.9.9");
    expect(slow.status).toBe(429);
    expect(Number(slow.headers.get("retry-after"))).toBeGreaterThan(0);
    expect((await ask(h, `kind=allocated&vault=${vault}`, "8.8.8.8")).status).toBe(200);
  });
});
