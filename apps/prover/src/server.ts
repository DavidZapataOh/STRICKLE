import { createHash, timingSafeEqual } from "node:crypto";
import { type IncomingMessage, type ServerResponse, createServer } from "node:http";
import type { InputMap } from "@noir-lang/noir_js";
import { type Prover, ProtocolError, ReplayCache, type ProverKey, decodeRequest, generateProverKey } from "@strickle/prover";
import { JobQueue } from "./queue.ts";
import type { SpecResolver } from "./spec.ts";

export interface ServiceConfig {
  /** Circuits the service will prove; anything else is refused before any decryption. */
  circuits: string[];
  prover: Prover;
  /** SHA-256 hex digests of the accepted bearer tokens. */
  tokenHashes: string[];
  secretKey?: ProverKey;
  /** When set, `spend_spec` is served: the service builds the witness from a spec against its copy of the pool ledger. */
  specs?: SpecResolver;
  /** Unix seconds. */
  now?: () => number;
  maxBody?: number;
  maxQueue?: number;
  timeoutMs?: number;
  log?: (line: string) => void;
}

export interface Service {
  listen(port?: number, host?: string): Promise<number>;
  close(): Promise<void>;
  publicKey: Uint8Array;
}

const VERSION = "1";
const hex = (bytes: Uint8Array): string => `0x${Buffer.from(bytes).toString("hex")}`;

function authorised(header: string | undefined, hashes: Buffer[]): boolean {
  const match = header?.match(/^Bearer (.+)$/);
  if (!match) return false;
  const given = createHash("sha256").update(match[1] as string).digest();
  let ok = false;
  for (const known of hashes) ok = timingSafeEqual(given, known) || ok;
  return ok;
}

export function createService(config: ServiceConfig): Service {
  const key = config.secretKey ?? generateProverKey();
  const now = config.now ?? (() => Math.floor(Date.now() / 1000));
  const maxBody = config.maxBody ?? 64 * 1024;
  const maxQueue = config.maxQueue ?? 8;
  const timeoutMs = config.timeoutMs ?? 30_000;
  const log = config.log ?? (() => undefined);
  const hashes = config.tokenHashes.map((digest) => Buffer.from(digest, "hex"));
  const replay = new ReplayCache(600);
  const queue = new JobQueue(maxQueue);
  let counter = 0;

  async function readBody(request: IncomingMessage): Promise<string | undefined> {
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of request) {
      size += (chunk as Buffer).length;
      if (size > maxBody) return undefined;
      chunks.push(chunk as Buffer);
    }
    return Buffer.concat(chunks).toString("utf8");
  }

  function send(response: ServerResponse, status: number, body: unknown): void {
    const text = JSON.stringify(body);
    response.writeHead(status, { "content-type": "application/json", "content-length": Buffer.byteLength(text), "cache-control": "no-store" });
    response.end(text);
  }

  async function prove(request: IncomingMessage, response: ServerResponse): Promise<number> {
    if (!authorised(request.headers.authorization, hashes)) return reply(response, 401, { error: "unauthorized" });
    const text = await readBody(request);
    if (text === undefined) {
      request.destroy();
      return reply(response, 413, { error: "too-large" });
    }
    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      return reply(response, 400, { error: "malformed" });
    }
    const circuit = typeof body === "object" && body !== null ? (body as Record<string, unknown>).circuit : undefined;
    if (typeof circuit !== "string" || !/^[a-z][a-z0-9_]{0,31}$/.test(circuit)) return reply(response, 400, { error: "malformed" });
    if (!config.circuits.includes(circuit) || (circuit === "spend_spec" && !config.specs)) return reply(response, 400, { error: "unknown-circuit" });

    let decoded;
    try {
      decoded = decodeRequest(body, key, now(), replay);
    } catch (error) {
      return reply(response, 400, { error: error instanceof ProtocolError ? error.code : "malformed" });
    }

    const started = Date.now();
    const job = queue.run(async () => {
      if (circuit !== "spend_spec") return config.prover.proveInputs(circuit, decoded.inputs as InputMap);
      return config.prover.proveInputs("spend", await (config.specs as SpecResolver).inputsFor(decoded.inputs));
    });
    if (!job) return reply(response, 429, { error: "busy" });
    let timer: NodeJS.Timeout | undefined;
    try {
      const result = await Promise.race([
        job,
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error("timeout")), timeoutMs);
        }),
      ]);
      return reply(response, 200, { proof: hex(result.proof), publicInputs: result.publicInputs, proveMs: Date.now() - started });
    } catch (error) {
      if (error instanceof Error && error.message === "timeout") {
        job.catch(() => undefined);
        return reply(response, 504, { error: "timeout" });
      }
      return reply(response, 422, { error: "unprovable" });
    } finally {
      clearTimeout(timer);
    }
  }

  async function leaf(request: IncomingMessage, response: ServerResponse): Promise<number> {
    if (!authorised(request.headers.authorization, hashes)) return reply(response, 401, { error: "unauthorized" });
    if (!config.specs) return reply(response, 404, { error: "not-found" });
    const commitment = new URL(request.url ?? "", "http://localhost").searchParams.get("c") ?? "";
    if (!/^0x[0-9a-f]{1,64}$/.test(commitment)) return reply(response, 400, { error: "malformed" });
    const index = await config.specs.leaf(BigInt(commitment));
    return reply(response, 200, { index: index ?? null, size: config.specs.size() });
  }

  function reply(response: ServerResponse, status: number, body: unknown): number {
    send(response, status, body);
    return status;
  }

  const server = createServer((request, response) => {
    const started = Date.now();
    const id = ++counter;
    const route = `${request.method} ${request.url}`;
    const finish = (status: number) => log(`${request.method} ${request.url?.split("?")[0]} ${status} ${Date.now() - started}ms #${id}`);
    void (async () => {
      try {
        if (route === "GET /v1/info") {
          finish(reply(response, 200, { version: VERSION, publicKey: hex(key.publicKey), circuits: config.circuits, maxBody, maxQueue }));
        } else if (route === "POST /v1/prove") {
          finish(await prove(request, response));
        } else if (route.startsWith("GET /v1/leaf?")) {
          finish(await leaf(request, response));
        } else {
          finish(reply(response, 404, { error: "not-found" }));
        }
      } catch {
        if (!response.headersSent) finish(reply(response, 500, { error: "internal" }));
      }
    })();
  });

  return {
    publicKey: key.publicKey,
    listen: (port = 0, host = "127.0.0.1") =>
      new Promise((resolve) => {
        server.listen(port, host, () => resolve((server.address() as { port: number }).port));
      }),
    close: () =>
      new Promise((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
}
