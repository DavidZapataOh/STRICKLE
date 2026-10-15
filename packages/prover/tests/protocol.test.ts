import { describe, expect, it } from "vitest";
import { ProtocolError, ReplayCache, aadFor, decodeRequest, encodeRequest } from "../src/protocol.ts";
import { generateProverKey, seal } from "../src/sealed.ts";

const key = generateProverKey();
const id = (n: number) => n.toString(16).padStart(64, "0");
const request = (overrides: Record<string, unknown> = {}) => ({ requestId: id(1), issuedAt: 1_000, circuit: "spend", inputs: { amount: "5" }, ...overrides });
const decode = (body: unknown, now = 1_000, cache = new ReplayCache(600)) => decodeRequest(body as { circuit: string; sealed: string }, key, now, cache);
const codeOf = (fn: () => unknown): string | undefined => {
  try {
    fn();
  } catch (error) {
    return error instanceof ProtocolError ? error.code : "other";
  }
  return undefined;
};

describe("prove request protocol", () => {
  it("round-trips a request", () => {
    const body = encodeRequest(request(), key.publicKey);
    expect(body.circuit).toBe("spend");
    expect(decode(body)).toEqual(request());
  });

  it("accepts the edges of the freshness window and rejects beyond them", () => {
    expect(decode(encodeRequest(request({ issuedAt: 940 }), key.publicKey), 1_000)).toBeDefined();
    expect(decode(encodeRequest(request({ issuedAt: 1_005 }), key.publicKey), 1_000)).toBeDefined();
    expect(codeOf(() => decode(encodeRequest(request({ issuedAt: 939 }), key.publicKey), 1_000))).toBe("stale");
    expect(codeOf(() => decode(encodeRequest(request({ issuedAt: 1_006 }), key.publicKey), 1_000))).toBe("stale");
  });

  it("rejects a repeated request id and remembers it for ten minutes only", () => {
    const cache = new ReplayCache(600);
    const body = encodeRequest(request(), key.publicKey);
    expect(decode(body, 1_000, cache)).toBeDefined();
    expect(codeOf(() => decode(body, 1_000, cache))).toBe("replayed");
    const later = encodeRequest(request({ issuedAt: 1_700 }), key.publicKey);
    expect(decode(later, 1_700, cache)).toBeDefined();
  });

  it("does not remember a request that failed validation", () => {
    const cache = new ReplayCache(600);
    expect(codeOf(() => decode(encodeRequest(request({ issuedAt: 1 }), key.publicKey), 1_000, cache))).toBe("stale");
    expect(decode(encodeRequest(request(), key.publicKey), 1_000, cache)).toBeDefined();
  });

  it("rejects a body re-aimed at another circuit", () => {
    const body = encodeRequest(request(), key.publicKey);
    expect(codeOf(() => decode({ ...body, circuit: "shield" }))).toBe("malformed");
  });

  it("rejects a plaintext whose circuit differs from the one it was sealed for", () => {
    const plaintext = new TextEncoder().encode(JSON.stringify(request({ circuit: "shield" })));
    const sealed = btoa(String.fromCharCode(...seal(plaintext, key.publicKey, aadFor("spend"))));
    expect(codeOf(() => decode({ circuit: "spend", sealed }))).toBe("wrong-circuit");
  });

  it("rejects malformed bodies with a fixed code and no content", () => {
    const body = encodeRequest(request(), key.publicKey);
    const tampered = body.sealed.slice(0, 20) + (body.sealed[20] === "A" ? "B" : "A") + body.sealed.slice(21);
    for (const bad of [null, "text", {}, { circuit: 1, sealed: "x" }, { circuit: "spend", sealed: 5 }, { circuit: "spend", sealed: "%%%" }, { circuit: "spend", sealed: tampered }, { circuit: "Spend!", sealed: body.sealed }]) {
      const error = (() => {
        try {
          decode(bad);
        } catch (e) {
          return e as ProtocolError;
        }
      })();
      expect(error).toBeInstanceOf(ProtocolError);
      expect(error?.message).toBe(error?.code);
    }
  });

  it("rejects requests with invalid ids, times or missing fields", () => {
    for (const bad of [request({ requestId: "short" }), request({ requestId: id(255).toUpperCase() }), request({ issuedAt: 1.5 }), request({ issuedAt: "1000" }), request({ inputs: undefined })]) {
      expect(codeOf(() => decode(encodeRequest(bad, key.publicKey)))).toBe("malformed");
    }
  });
});
