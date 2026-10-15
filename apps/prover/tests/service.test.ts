import { readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { createProver, encodeRequest, type Prover } from "@strickle/prover";
import { proveRemote } from "@strickle/prover/client";
import { nodeCircuitLoader } from "@strickle/prover/node";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createService, type Service } from "../src/server.ts";
import { TOKEN, TOKEN_HASH, SECRET, shieldWitness, spendWitness } from "./helpers.ts";

const circuitsDir = new URL("../../../circuits/target/", import.meta.url);
const real = createProver({ loadCircuit: nodeCircuitLoader(circuitsDir), backend: { threads: 1 } });

let service: Service;
let base: string;
const lines: string[] = [];
const clock = 1_800_000_000;

beforeAll(async () => {
  service = createService({ circuits: ["shield", "spend"], prover: real, tokenHashes: [TOKEN_HASH], now: () => clock, log: (line) => lines.push(line) });
  base = `http://127.0.0.1:${await service.listen(0)}`;
});

afterAll(async () => {
  await service.close();
  await real.destroy();
});

const publicKey = () => service.publicKey;
const post = (body: unknown, headers: Record<string, string> = { authorization: `Bearer ${TOKEN}` }, path = "/v1/prove") =>
  fetch(`${base}${path}`, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: typeof body === "string" ? body : JSON.stringify(body) });
const requestId = (n: number) => n.toString(16).padStart(64, "0");
const request = (n: number, circuit: string, inputs: unknown, issuedAt = clock) => encodeRequest({ requestId: requestId(n), issuedAt, circuit, inputs }, publicKey());

describe("prover service: proving", () => {
  it("proves a shield and a spend and the answers match the witness builder", async () => {
    const shield = shieldWitness();
    const answer = await proveRemote({ url: base, token: TOKEN, publicKey: publicKey(), circuit: "shield", inputs: shield.inputs, expectedPublicInputs: shield.publicInputs, now: () => clock });
    expect(answer.publicInputs).toHaveLength(4);
    expect(await real.verify("shield", { proof: Uint8Array.from(Buffer.from(answer.proof.slice(2), "hex")), publicInputs: answer.publicInputs })).toBe(true);

    const spend = spendWitness();
    const answer2 = await proveRemote({ url: base, token: TOKEN, publicKey: publicKey(), circuit: "spend", inputs: spend.inputs, expectedPublicInputs: spend.publicInputs, now: () => clock });
    expect(answer2.publicInputs).toHaveLength(13);
  });

  it("publishes only the public key and the circuit list", async () => {
    const info = (await (await fetch(`${base}/v1/info`)).json()) as { circuits: string[]; publicKey: string };
    expect(Object.keys(info).sort()).toEqual(["circuits", "maxBody", "maxQueue", "publicKey", "version"]);
    expect(info.circuits).toEqual(["shield", "spend"]);
    expect(info.publicKey).toBe(`0x${Buffer.from(publicKey()).toString("hex")}`);
  });

  it("refuses an unprovable witness with a generic answer", async () => {
    const bad = { ...shieldWitness().inputs, amount: "1" };
    const response = await post(request(900, "shield", bad));
    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({ error: "unprovable" });
  });
});

describe("prover service: authentication and routing", () => {
  it("requires the bearer token", async () => {
    const body = request(10, "shield", shieldWitness().inputs);
    expect((await post(body, {})).status).toBe(401);
    expect((await post(body, { authorization: "Bearer wrong" })).status).toBe(401);
    expect((await post(body, { authorization: `Bearer ${TOKEN.replace(/.$/, "x")}` })).status).toBe(401);
    expect((await post(body, { authorization: `Basic ${TOKEN}` })).status).toBe(401);
    expect((await post(body)).status).toBe(200);
  });

  it("answers only the documented routes and methods", async () => {
    expect((await fetch(`${base}/`)).status).toBe(404);
    expect((await fetch(`${base}/v1/prove`)).status).toBe(404);
    expect((await fetch(`${base}/v1/info`, { method: "POST" })).status).toBe(404);
    expect((await post("{}", undefined, "/v1/other")).status).toBe(404);
  });
});

describe("prover service: hostile requests", () => {
  const generic = async (response: Response, status: number, code: string) => {
    expect(response.status).toBe(status);
    expect(await response.text()).toBe(JSON.stringify({ error: code }));
  };

  it("answers malformed bodies with a fixed, content-free error", async () => {
    const valid = request(20, "shield", shieldWitness().inputs);
    await generic(await post("not json"), 400, "malformed");
    await generic(await post({}), 400, "malformed");
    await generic(await post({ circuit: "shield" }), 400, "malformed");
    await generic(await post({ ...valid, sealed: `${valid.sealed.slice(0, 40)}AAAA${valid.sealed.slice(44)}` }), 400, "malformed");
    await generic(await post({ circuit: "shield", sealed: "%%%" }), 400, "malformed");
  });

  it("rejects a circuit that is not allow-listed before doing any decryption", async () => {
    await generic(await post({ circuit: "other", sealed: "AAAA" }), 400, "unknown-circuit");
  });

  it("rejects a body sealed for another service key", async () => {
    const other = (await import("@strickle/prover")).generateProverKey();
    const body = encodeRequest({ requestId: requestId(30), issuedAt: clock, circuit: "shield", inputs: shieldWitness().inputs }, other.publicKey);
    await generic(await post(body), 400, "malformed");
  });

  it("refuses a replayed request", async () => {
    const body = request(40, "shield", shieldWitness().inputs);
    expect((await post(body)).status).toBe(200);
    await generic(await post(body), 400, "replayed");
  });

  it("refuses stale and future-dated requests", async () => {
    await generic(await post(request(50, "shield", shieldWitness().inputs, clock - 61)), 400, "stale");
    await generic(await post(request(51, "shield", shieldWitness().inputs, clock + 6)), 400, "stale");
  });

  it("refuses a body above the size limit without reading it all", async () => {
    const response = await post(JSON.stringify({ circuit: "shield", sealed: "A".repeat(70_000) }));
    expect(response.status).toBe(413);
  });
});

describe("prover service: nothing leaks", () => {
  it("never writes the witness to logs, output streams or disk", async () => {
    const marker = 9_876_543_210_123_456_789_000_007n;
    const witness = shieldWitness({ salt: marker });
    const stdout: string[] = [];
    const stderr: string[] = [];
    const originalOut = process.stdout.write.bind(process.stdout);
    const originalErr = process.stderr.write.bind(process.stderr);
    process.stdout.write = ((chunk: string | Uint8Array) => (stdout.push(String(chunk)), true)) as typeof process.stdout.write;
    process.stderr.write = ((chunk: string | Uint8Array) => (stderr.push(String(chunk)), true)) as typeof process.stderr.write;
    const before = [readdirSync(tmpdir()).sort(), readdirSync(process.cwd()).sort()];
    try {
      const answer = await proveRemote({ url: base, token: TOKEN, publicKey: publicKey(), circuit: "shield", inputs: witness.inputs, now: () => clock });
      expect(answer.proof).toMatch(/^0x/);
      await post(request(60, "shield", { ...witness.inputs, amount: "1" }));
    } finally {
      process.stdout.write = originalOut;
      process.stderr.write = originalErr;
    }
    const everything = [...lines, ...stdout, ...stderr].join("\n");
    const forms = [marker.toString(), `0x${marker.toString(16)}`, marker.toString(16).padStart(64, "0"), SECRET.toString(), TOKEN];
    for (const form of forms) expect(everything).not.toContain(form);
    expect([readdirSync(tmpdir()).sort(), readdirSync(process.cwd()).sort()]).toEqual(before);
    expect(lines.length).toBeGreaterThan(0);
    expect(lines.every((line) => /^(GET|POST) \/\S* \d{3} \d+ms #\d+$/.test(line))).toBe(true);
  });
});

function gated(delayMs: number): Prover {
  return {
    prepare: real.prepare.bind(real),
    execute: real.execute.bind(real),
    prove: real.prove.bind(real),
    verify: real.verify.bind(real),
    destroy: real.destroy.bind(real),
    proveInputs: async (name, inputs) => {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      return real.proveInputs(name, inputs);
    },
  };
}

describe("prover service: limits", () => {
  it("answers 429 when the queue is full and recovers afterwards", async () => {
    const small = createService({ circuits: ["shield"], prover: gated(400), tokenHashes: [TOKEN_HASH], maxQueue: 1, now: () => clock });
    const url = `http://127.0.0.1:${await small.listen(0)}`;
    const send = (n: number) =>
      fetch(`${url}/v1/prove`, {
        method: "POST",
        headers: { authorization: `Bearer ${TOKEN}`, "content-type": "application/json" },
        body: JSON.stringify(encodeRequest({ requestId: requestId(n), issuedAt: clock, circuit: "shield", inputs: shieldWitness().inputs }, small.publicKey)),
      });
    try {
      const first = send(70);
      await new Promise((resolve) => setTimeout(resolve, 100));
      expect((await send(71)).status).toBe(429);
      expect((await first).status).toBe(200);
      expect((await send(72)).status).toBe(200);
    } finally {
      await small.close();
    }
  });

  it("answers 504 when proving takes too long and serves the next request", async () => {
    const slow = createService({ circuits: ["shield"], prover: gated(300), tokenHashes: [TOKEN_HASH], timeoutMs: 100, now: () => clock });
    const url = `http://127.0.0.1:${await slow.listen(0)}`;
    const send = (n: number) =>
      fetch(`${url}/v1/prove`, {
        method: "POST",
        headers: { authorization: `Bearer ${TOKEN}`, "content-type": "application/json" },
        body: JSON.stringify(encodeRequest({ requestId: requestId(n), issuedAt: clock, circuit: "shield", inputs: shieldWitness().inputs }, slow.publicKey)),
      });
    try {
      expect((await send(80)).status).toBe(504);
      await new Promise((resolve) => setTimeout(resolve, 2000));
    } finally {
      await slow.close();
    }
    const quick = createService({ circuits: ["shield"], prover: real, tokenHashes: [TOKEN_HASH], timeoutMs: 20_000, now: () => clock });
    const quickUrl = `http://127.0.0.1:${await quick.listen(0)}`;
    try {
      const ok = await fetch(`${quickUrl}/v1/prove`, {
        method: "POST",
        headers: { authorization: `Bearer ${TOKEN}`, "content-type": "application/json" },
        body: JSON.stringify(encodeRequest({ requestId: requestId(81), issuedAt: clock, circuit: "shield", inputs: shieldWitness().inputs }, quick.publicKey)),
      });
      expect(ok.status).toBe(200);
    } finally {
      await quick.close();
    }
  });
});

describe("prover client", () => {
  it("refuses an answer whose public inputs differ from the ones it expects", async () => {
    const witness = shieldWitness();
    const wrong = [...witness.publicInputs];
    wrong[1] = (wrong[1] as bigint) + 1n;
    await expect(proveRemote({ url: base, token: TOKEN, publicKey: publicKey(), circuit: "shield", inputs: witness.inputs, expectedPublicInputs: wrong, now: () => clock })).rejects.toThrow(/public inputs/);
  });

  it("refuses a service whose key is not the pinned one", async () => {
    const { fetchServiceInfo } = await import("@strickle/prover/client");
    const info = await fetchServiceInfo(base);
    expect(info.publicKey).toBe(`0x${Buffer.from(publicKey()).toString("hex")}`);
    await expect(fetchServiceInfo(base, new Uint8Array(32))).rejects.toThrow(/key/);
  });

  it("reports the status of a refused request without leaking its content", async () => {
    await expect(proveRemote({ url: base, token: "wrong-token", publicKey: publicKey(), circuit: "shield", inputs: shieldWitness().inputs, now: () => clock })).rejects.toThrow(/401/);
  });
});

