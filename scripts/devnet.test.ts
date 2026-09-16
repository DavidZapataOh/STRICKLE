import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { parseComposePs, probe, readGenesis, summarizeStatus } from "./devnet.ts";

const genesis = "0x1e8776a7164dd378443771ef2d726be4f71aa771b464f57cfbf656bac819ce69";
const servers: Server[] = [];

afterEach(() => {
  for (const server of servers.splice(0)) server.close();
});

async function serve(
  handler: (body: string) => { status: number; body: string } | null,
): Promise<string> {
  const server = createServer((request, response) => {
    let body = "";
    request.on("data", (chunk) => {
      body += chunk;
    });
    request.on("end", () => {
      const answer = handler(body);
      if (answer === null) return;
      response.writeHead(answer.status, { "content-type": "application/json" });
      response.end(answer.body);
    });
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

function validInput(): Parameters<typeof summarizeStatus>[0] {
  return {
    services: ["node", "indexer", "proof-server"],
    containers: [
      { service: "node", state: "running", health: "healthy" },
      { service: "indexer", state: "running", health: "healthy" },
      { service: "proof-server", state: "running", health: "healthy" },
    ],
    probes: [
      { service: "indexer", url: "http://127.0.0.1:8088/ready", status: 200, ms: 3 },
      { service: "proof-server", url: "http://127.0.0.1:6300/health", status: 200, ms: 2 },
    ],
    genesis,
    expectedGenesis: genesis,
  };
}

describe("parseComposePs", () => {
  it("reads one JSON object per line", () => {
    const output = [
      '{"Service":"node","State":"running","Health":"healthy"}',
      '{"Service":"indexer","State":"running","Health":""}',
    ].join("\n");
    expect(parseComposePs(output)).toEqual([
      { service: "node", state: "running", health: "healthy" },
      { service: "indexer", state: "running", health: undefined },
    ]);
  });

  it("reads a JSON array", () => {
    const output = '[{"Service":"node","State":"exited","Health":""}]';
    expect(parseComposePs(output)).toEqual([
      { service: "node", state: "exited", health: undefined },
    ]);
  });

  it("reads no containers", () => {
    expect(parseComposePs("\n")).toEqual([]);
  });
});

describe("summarizeStatus", () => {
  it("accepts a healthy devnet", () => {
    expect(summarizeStatus(validInput())).toEqual([]);
  });

  it("rejects a missing container", () => {
    const input = validInput();
    input.containers = input.containers.filter((container) => container.service !== "indexer");
    expect(summarizeStatus(input)).toEqual(["indexer: container is missing"]);
  });

  it("rejects a stopped container", () => {
    const input = validInput();
    input.containers[0] = { service: "node", state: "exited" };
    expect(summarizeStatus(input)).toEqual(["node: container is exited"]);
  });

  it("rejects an unhealthy container", () => {
    const input = validInput();
    input.containers[2] = { service: "proof-server", state: "running", health: "starting" };
    expect(summarizeStatus(input)).toEqual(["proof-server: container is starting"]);
  });

  it("rejects an unreachable endpoint", () => {
    const input = validInput();
    input.probes[1] = {
      service: "proof-server",
      url: "http://127.0.0.1:6300/health",
      error: "TypeError",
      ms: 1,
    };
    expect(summarizeStatus(input)).toEqual([
      "proof-server: http://127.0.0.1:6300/health is unreachable (TypeError)",
    ]);
  });

  it("rejects an endpoint that is not ready", () => {
    const input = validInput();
    input.probes[0] = {
      service: "indexer",
      url: "http://127.0.0.1:8088/ready",
      status: 503,
      ms: 4,
    };
    expect(summarizeStatus(input)).toEqual(["indexer: http://127.0.0.1:8088/ready returned 503"]);
  });

  it("rejects another chain", () => {
    const input = validInput();
    input.genesis = "0xdead";
    expect(summarizeStatus(input)).toEqual([`node: genesis is 0xdead, expected ${genesis}`]);
  });

  it("rejects a genesis hash it cannot read", () => {
    const input = validInput();
    input.genesis = undefined;
    expect(summarizeStatus(input)).toEqual(["node: genesis hash could not be read"]);
  });
});

describe("probe", () => {
  it("reports a healthy endpoint", async () => {
    const url = await serve(() => ({ status: 200, body: '{"status":"ok"}' }));
    const result = await probe("proof-server", `${url}/health`);
    expect(result.status).toBe(200);
    expect(result.error).toBeUndefined();
  });

  it("reports a status code", async () => {
    const url = await serve(() => ({ status: 503, body: "{}" }));
    expect((await probe("indexer", `${url}/ready`)).status).toBe(503);
  });

  it("reports a closed port", async () => {
    const url = await serve(() => ({ status: 200, body: "{}" }));
    servers.splice(0).forEach((server) => {
      server.close();
    });
    const result = await probe("indexer", `${url}/ready`);
    expect(result.status).toBeUndefined();
    expect(result.error).toBe("TypeError");
  });

  it("reports a timeout", async () => {
    const url = await serve(() => null);
    expect((await probe("node", url, 50)).error).toBe("TimeoutError");
  });
});

describe("readGenesis", () => {
  it("reads the genesis hash over JSON-RPC", async () => {
    const url = await serve((body) => {
      expect(JSON.parse(body)).toMatchObject({ method: "chain_getBlockHash", params: [0] });
      return { status: 200, body: JSON.stringify({ jsonrpc: "2.0", id: 1, result: genesis }) };
    });
    expect(await readGenesis(url)).toBe(genesis);
  });

  it("reads nothing from an error response", async () => {
    const url = await serve(() => ({
      status: 200,
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, error: { code: -32601, message: "unknown" } }),
    }));
    expect(await readGenesis(url)).toBeUndefined();
  });

  it("reads nothing from a closed port", async () => {
    const url = await serve(() => ({ status: 200, body: "{}" }));
    servers.splice(0).forEach((server) => {
      server.close();
    });
    expect(await readGenesis(url)).toBeUndefined();
  });
});
