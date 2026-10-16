import { createHash } from "node:crypto";
import { type Server, createServer } from "node:http";
import { privateKeyToAccount } from "viem/accounts";
import { afterEach, describe, expect, it } from "vitest";
import { sortedStringify } from "@strickle/agent/gateway";
import { postToGateway } from "../src/server/forward.ts";

const key = `0x${"02".repeat(32)}` as const;
const envelope = { vault: "0x00000000000000000000000000000000000000a1", sealed: `0x${"ab".repeat(80)}` };

// The gateway is an external service: this local HTTP server stands in for it in the unit tests; the live proof (Task 10) uses the real one.
let server: Server | undefined;
const gateway = async (answer: (request: { headers: Record<string, string | string[] | undefined>; body: string }) => { status: number; body: unknown; raw?: string }) => {
  const seen: { headers: Record<string, string | string[] | undefined>; body: string }[] = [];
  server = createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      seen.push({ headers: req.headers, body });
      const out = answer({ headers: req.headers, body });
      res.writeHead(out.status, { "content-type": out.raw === undefined ? "application/json" : "text/plain" });
      res.end(out.raw ?? JSON.stringify(out.body));
    });
  });
  await new Promise<void>((resolve) => server?.listen(0, "127.0.0.1", resolve));
  const port = (server?.address() as { port: number }).port;
  return { url: `http://127.0.0.1:${port}`, seen };
};
afterEach(() => new Promise<void>((resolve) => (server ? server.close(() => resolve()) : resolve())));

const send = (url: string) => postToGateway({ url, workflowId: `0x${"cd".repeat(32)}`, privateKey: key, envelope });

describe("postToGateway", () => {
  it("sends the envelope as the workflow input with a JWT only the gateway key could sign", async () => {
    const { url, seen } = await gateway(() => ({ status: 200, body: { jsonrpc: "2.0", id: "x", result: { status: "ACCEPTED" } } }));
    expect(await send(url)).toBe("accepted");
    const sent = JSON.parse(seen[0]?.body ?? "{}");
    expect(sent.method).toBe("workflows.execute");
    expect(sent.params.input).toEqual(envelope);
    expect(sent.params.workflow.workflowID).toBe("cd".repeat(32));
    const token = String(seen[0]?.headers.authorization).replace("Bearer ", "");
    const payload = JSON.parse(Buffer.from(token.split(".")[1] as string, "base64url").toString("utf8"));
    expect(payload.iss).toBe(privateKeyToAccount(key).address);
    expect(payload.digest).toBe(`0x${createHash("sha256").update(sortedStringify(sent)).digest("hex")}`);
  });

  it("calls an HTTP 429 busy whatever the body is, JSON or plain text", async () => {
    expect(await send((await gateway(() => ({ status: 429, body: { error: { message: "rate limit exceeded" } } }))).url)).toBe("busy");
    await new Promise<void>((resolve) => server?.close(() => resolve()));
    expect(await send((await gateway(() => ({ status: 429, body: null, raw: "Too Many Requests" }))).url)).toBe("busy");
  });

  it("calls a JSON-RPC rate-limit error busy and any other refusal rejected without echoing it", async () => {
    expect(await send((await gateway(() => ({ status: 200, body: { error: { code: 429, message: "rate limit exceeded" } } }))).url)).toBe("busy");
    await new Promise<void>((resolve) => server?.close(() => resolve()));
    expect(await send((await gateway(() => ({ status: 200, body: { error: { message: "secret detail about the workflow" } } }))).url)).toBe("rejected");
  });

  it("says unavailable when the gateway cannot be reached or answers with a server error", async () => {
    expect(await send("http://127.0.0.1:1")).toBe("unavailable");
    expect(await send((await gateway(() => ({ status: 502, body: null, raw: "bad gateway" }))).url)).toBe("unavailable");
  });
});
