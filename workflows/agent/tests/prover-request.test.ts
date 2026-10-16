// workflows/agent/tests/prover-call.test.ts
import { generateProverKey } from "@strickle/prover/sealed";
import { ReplayCache, decodeRequest } from "@strickle/prover/protocol";
import { describe, expect, it } from "vitest";
import { getAddress } from "viem";
import { parseMaster } from "../enclave/keys.ts";
import { parseProveAnswer, proveBody } from "../enclave/prover-request.ts";

const server = generateProverKey();
const master = parseMaster(`0x${"11".repeat(32)}`);
const vault = getAddress("0x00000000000000000000000000000000000000a1");
const inputs = { hello: "world" };

describe("proveBody", () => {
  it("is sealed to the service key and decodes there with a derived id and the spec", () => {
    const body = proveBody(master, vault, inputs, server.publicKey, 1_000);
    expect(body.circuit).toBe("spend_spec");
    expect(JSON.stringify(body)).not.toContain("hello");
    const decoded = decodeRequest(body, server, 1_000, new ReplayCache(600));
    expect(decoded).toMatchObject({ issuedAt: 1_000, circuit: "spend_spec", inputs });
    expect(decoded.requestId).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is reproducible for the same request", () => {
    expect(proveBody(master, vault, inputs, server.publicKey, 1_000)).toEqual(proveBody(master, vault, inputs, server.publicKey, 1_000));
  });

  it("never reuses an id or an ephemeral key for a different request", () => {
    const a = proveBody(master, vault, inputs, server.publicKey, 1_000);
    for (const other of [proveBody(master, vault, inputs, server.publicKey, 1_001), proveBody(master, vault, { hello: "there" }, server.publicKey, 1_000)]) {
      expect(other.sealed).not.toBe(a.sealed);
      expect(decodeRequest(other, server, 1_001, new ReplayCache(600)).requestId).not.toBe(decodeRequest(a, server, 1_001, new ReplayCache(600)).requestId);
    }
  });
});

describe("parseProveAnswer", () => {
  it("returns the proof and the public inputs as bigints", () => {
    expect(parseProveAnswer(JSON.stringify({ proof: "0xc0ffee", publicInputs: ["0x01", "0x02"], proveMs: 5 }))).toEqual({ proof: "0xc0ffee", publicInputs: [1n, 2n] });
  });

  it("refuses an error body or garbage without repeating it", () => {
    expect(() => parseProveAnswer(JSON.stringify({ error: "unprovable: secret detail" }))).toThrow(/^prover error$/);
    expect(() => parseProveAnswer("nope")).toThrow(/^prover error$/);
    expect(() => parseProveAnswer(JSON.stringify({ proof: "0x", publicInputs: [] }))).toThrow(/^prover error$/);
  });
});
