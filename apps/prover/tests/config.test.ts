import { describe, expect, it } from "vitest";
import { newToken, parseConfig } from "../src/config.ts";

const hash = "a".repeat(64);

describe("service configuration", () => {
  it("reads tokens, port and circuit directory from the environment", () => {
    const config = parseConfig({ PROVER_TOKENS: `${hash},${"b".repeat(64)}`, PORT: "9000", PROVER_CIRCUITS: "/srv/circuits" });
    expect(config.tokenHashes).toEqual([hash, "b".repeat(64)]);
    expect(config.port).toBe(9000);
    expect(config.circuitsDir).toBe("/srv/circuits");
    expect(config.secret).toBeUndefined();
  });

  it("uses safe defaults", () => {
    const config = parseConfig({ PROVER_TOKENS: hash });
    expect(config.port).toBe(8787);
    expect(config.circuitsDir).toBe("circuits/target");
  });

  it("refuses to start without valid tokens", () => {
    expect(() => parseConfig({})).toThrow(/PROVER_TOKENS/);
    expect(() => parseConfig({ PROVER_TOKENS: "plain-text-token" })).toThrow(/SHA-256/);
    expect(() => parseConfig({ PROVER_TOKENS: `${hash},short` })).toThrow(/SHA-256/);
  });

  it("validates the port and the optional secret", () => {
    expect(() => parseConfig({ PROVER_TOKENS: hash, PORT: "70000" })).toThrow(/PORT/);
    expect(() => parseConfig({ PROVER_TOKENS: hash, PORT: "abc" })).toThrow(/PORT/);
    expect(() => parseConfig({ PROVER_TOKENS: hash, PROVER_SECRET: "not-hex" })).toThrow(/PROVER_SECRET/);
    expect(parseConfig({ PROVER_TOKENS: hash, PROVER_SECRET: "0x1234" }).secret).toBe(0x1234n);
  });

  it("generates long random tokens together with the digest the service stores", async () => {
    const { createHash } = await import("node:crypto");
    const a = newToken();
    const b = newToken();
    expect(a.token).not.toBe(b.token);
    expect(a.token.length).toBeGreaterThanOrEqual(43);
    expect(a.hash).toBe(createHash("sha256").update(a.token).digest("hex"));
  });

  it("reads the pool settings together and refuses a partial set", () => {
    const pool = { POOL_ADDRESS: "0x00000000000000000000000000000000000000dd", POOL_DEPLOY_BLOCK: "123", RPC_URL: "https://rpc.testnet.arc.io" };
    expect(parseConfig({ PROVER_TOKENS: hash, ...pool }).pool).toEqual({ address: pool.POOL_ADDRESS, deployBlock: 123n, rpcUrl: pool.RPC_URL });
    expect(parseConfig({ PROVER_TOKENS: hash }).pool).toBeUndefined();
    expect(() => parseConfig({ PROVER_TOKENS: hash, POOL_ADDRESS: pool.POOL_ADDRESS })).toThrow(/POOL_/);
  });

  it("listens on localhost unless told otherwise", () => {
    expect(parseConfig({ PROVER_TOKENS: hash }).host).toBe("127.0.0.1");
    expect(parseConfig({ PROVER_TOKENS: hash, HOST: "0.0.0.0" }).host).toBe("0.0.0.0");
  });
});
