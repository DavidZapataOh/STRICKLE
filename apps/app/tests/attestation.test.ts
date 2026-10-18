import { readFileSync } from "node:fs";
import { type Hex, type PublicClient, encodeFunctionData, hexToBytes, parseAbi } from "viem";
import { describe, expect, it } from "vitest";
import { CAPABILITY_REGISTRY, latestReport, parseHeader, registrySigners, reportHash, verifyReport } from "../src/server/attestation.ts";

const load = (name: string) => JSON.parse(readFileSync(new URL(`./fixtures/attestation/${name}`, import.meta.url), "utf8"));
const report = load("report.json") as { tx: Hex; receiver: Hex; at: number; raw: Hex; context: Hex; signatures: Hex[] };
const registry = load("signers.json") as { donId: number; f: number; signers: string[] };
const calls = load("registry-calls.json") as { data: string; result: string }[];
const raw = hexToBytes(report.raw);
const context = hexToBytes(report.context);
const signers = new Set(registry.signers);
const verify = (over: Partial<Parameters<typeof verifyReport>[0]> = {}) => verifyReport({ raw, context, signatures: report.signatures, signers, f: registry.f, ...over });

describe("the real report captured from Arc testnet", () => {
  it("names the DON, the workflow and its owner in the header", () => {
    const header = parseHeader(raw);
    expect(header.donId).toBe(registry.donId);
    expect(header.workflowId).toMatch(/^0x[0-9a-f]{64}$/);
    expect(header.workflowOwner).toMatch(/^0x[0-9a-f]{40}$/);
    expect(header.body.length).toBe(raw.length - 109);
  });

  it("is signed by enough of the DON's authorized nodes", async () => {
    const result = await verify();
    expect(result.ok).toBe(true);
    expect(result.valid).toBeGreaterThanOrEqual(registry.f + 1);
    expect(result.threshold).toBe(registry.f + 1);
  });
});

describe("verifyReport refuses what the documentation says to refuse", () => {
  it("a report that was changed by one byte", async () => {
    const tampered = new Uint8Array(raw);
    tampered[tampered.length - 1] = (tampered[tampered.length - 1] ?? 0) ^ 1;
    expect((await verify({ raw: tampered })).ok).toBe(false);
  });

  it("another context", async () => {
    expect((await verify({ context: new Uint8Array(context).map((byte, index) => (index === 0 ? byte ^ 1 : byte)) })).ok).toBe(false);
  });

  it("fewer signatures than the threshold", async () => {
    const result = await verify({ signatures: report.signatures.slice(0, registry.f) });
    expect(result.ok).toBe(false);
    expect(result.valid).toBe(registry.f);
  });

  it("a signature repeated many times, which counts once", async () => {
    const first = report.signatures[0] as Hex;
    const result = await verify({ signatures: Array.from({ length: 10 }, () => first) });
    expect(result.valid).toBe(1);
    expect(result.ok).toBe(registry.f + 1 <= 1);
  });

  it("signers the registry does not list, and signatures that are not 65 bytes", async () => {
    const result = await verify({ signers: new Set(registry.signers.slice(0, 1)), signatures: [...report.signatures, "0x1234"] });
    expect(result.valid).toBeLessThanOrEqual(1);
    expect(result.ok).toBe(false);
  });

  it("a hash that does not depend only on the report, since the context is part of it", () => {
    expect(reportHash(raw, context)).not.toBe(reportHash(raw, new Uint8Array(context.length)));
  });

  it("a report shorter than its header", () => {
    expect(() => parseHeader(new Uint8Array(50))).toThrow(/too short/);
  });
});

describe("registrySigners", () => {
  const replay = (override?: (data: string) => string | undefined) => ({ call: async ({ data, to }: { data: string; to: string }) => { expect(to.toLowerCase()).toBe(CAPABILITY_REGISTRY.toLowerCase()); return { data: override?.(data) ?? calls.find((entry) => entry.data === data)?.result }; } }) as unknown as PublicClient;

  it("reads the fault tolerance and the signers of the DON from the registry's real answers", async () => {
    const result = await registrySigners(replay(), registry.donId);
    expect(result.f).toBe(registry.f);
    expect([...result.signers].sort()).toEqual(registry.signers);
  });

  it("refuses an empty or truncated answer instead of trusting it", async () => {
    await expect(registrySigners(replay(() => "0x"), registry.donId)).rejects.toThrow();
    await expect(registrySigners({ call: async () => ({ data: undefined }) } as unknown as PublicClient, registry.donId)).rejects.toThrow(/no answer/);
  });
});

describe("latestReport", () => {
  const forwarder = "0x76c9cf548b4179F8901cda1f8623568b58215E62" as const;
  const receiver = report.receiver;
  const input = `0x11289565${"0".repeat(0)}`;
  const withTransactions = (txs: Record<string, { to: string; input: string }>, logs: { blockNumber: bigint; transactionHash: string }[]) =>
    ({
      getBlockNumber: async () => 1_000_000n,
      getLogs: async () => logs,
      getTransaction: async ({ hash }: { hash: string }) => txs[hash],
      getBlock: async ({ blockNumber }: { blockNumber: bigint }) => ({ timestamp: blockNumber }),
    }) as unknown as PublicClient;

  it("is null when nothing was delivered, and survives a failing read", async () => {
    expect(await latestReport(withTransactions({}, []), [receiver], forwarder)).toBeNull();
    expect(await latestReport({ getBlockNumber: async () => { throw new Error("down"); } } as unknown as PublicClient, [receiver], forwarder)).toBeNull();
  });

  it("decodes the forwarder's report call into the receiver, the report, the context, the signatures and the time of its block", async () => {
    const data = encodeFunctionData({ abi: parseAbi(["function report(address receiver, bytes rawReport, bytes reportContext, bytes[] signatures)"]), functionName: "report", args: [receiver, report.raw, report.context, report.signatures] });
    const txs = { "0xcc": { to: forwarder, input: data } };
    const found = await latestReport(withTransactions(txs, [{ blockNumber: 77n, transactionHash: "0xcc" }]), [receiver], forwarder);
    expect(found).toMatchObject({ tx: "0xcc", receiver: receiver.toLowerCase() === receiver ? receiver : receiver, at: 77 });
    expect(found?.signatures).toEqual(report.signatures);
    expect(Array.from(found?.raw ?? [])).toEqual(Array.from(raw));
    expect(Array.from(found?.context ?? [])).toEqual(Array.from(context));
  });

  it("skips a transaction that is not a forwarder report", async () => {
    const txs = { "0xaa": { to: "0x00000000000000000000000000000000000000d9", input }, "0xbb": { to: forwarder, input: "0xdeadbeef" } };
    expect(await latestReport(withTransactions(txs, [{ blockNumber: 5n, transactionHash: "0xaa" }, { blockNumber: 6n, transactionHash: "0xbb" }]), [receiver], forwarder)).toBeNull();
  });
});
