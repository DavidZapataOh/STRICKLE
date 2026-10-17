import { readFileSync } from "node:fs";
import { type Hex, hexToBytes } from "viem";
import { describe, expect, it } from "vitest";
import { type DeliveredReport, parseHeader } from "../src/server/attestation.ts";
import { attestationReport } from "../src/server/attestation-report.ts";

const load = (name: string) => JSON.parse(readFileSync(new URL(`./fixtures/attestation/${name}`, import.meta.url), "utf8"));
const fixture = load("report.json") as { tx: Hex; receiver: `0x${string}`; at: number; raw: Hex; context: Hex; signatures: Hex[] };
const registry = load("signers.json") as { donId: number; f: number; signers: string[] };
const delivered: DeliveredReport = { tx: fixture.tx, receiver: fixture.receiver, at: fixture.at, raw: hexToBytes(fixture.raw), context: hexToBytes(fixture.context), signatures: fixture.signatures };
const id = parseHeader(delivered.raw).workflowId;
const other = `0x${"11".repeat(32)}` as Hex;
const ZERO = `0x${"00".repeat(32)}` as Hex;
const named = (ids: (Hex | null)[]) => ["AgentExecutor", "AgentState", "AgentHeartbeat"].map((name, index) => ({ name, workflowId: ids[index] ?? null }));
const run = (over: Partial<Parameters<typeof attestationReport>[0]> = {}) =>
  attestationReport({ expected: async () => named([id, id, id]), latest: async () => delivered, signersOf: async () => ({ f: registry.f, signers: new Set(registry.signers) }), ...over });

describe("the three checks", () => {
  it("passes when the contracts agree on the workflow, and the latest report carries that workflow and enough DON signatures", async () => {
    const result = await run();
    expect(result.status).toBe("consistent");
    expect(result.report).toMatchObject({ ok: true, matches: true, workflowId: id, tx: fixture.tx });
    expect(result.reproduce).toContain("cre workflow hash ./workflows/agent --public_key 0x");
  });

  it("says which contract disagrees, which is not bound yet and which could not be read", async () => {
    expect((await run({ expected: async () => named([id, other, id]) })).status).toBe("mismatch");
    expect((await run({ expected: async () => named([id, ZERO, id]) })).status).toBe("unbound");
    expect((await run({ expected: async () => named([id, null, id]) })).status).toBe("unreadable");
  });

  it("fails the report when its workflow is not the one the contracts accept, even with valid signatures", async () => {
    const result = await run({ expected: async () => named([other, other, other]) });
    expect(result.status).toBe("consistent");
    expect(result.report).toMatchObject({ ok: false, matches: false });
  });

  it("fails the report when too few of the DON's nodes signed it", async () => {
    const result = await run({ latest: async () => ({ ...delivered, signatures: delivered.signatures.slice(0, registry.f) }) });
    expect(result.report).toMatchObject({ ok: false, matches: true });
  });

  it("says there is no report yet, and that the registry could not be read, instead of passing", async () => {
    expect((await run({ latest: async () => null })).report).toEqual({ error: "none" });
    expect((await run({ signersOf: async () => { throw new Error("rpc down"); } })).report).toEqual({ error: "unreadable" });
  });

  it("gives a generic command when there is no report to take the owner from", async () => {
    expect((await run({ latest: async () => null })).reproduce).toContain("<workflow owner>");
  });

  it("is not fooled by a report from another workflow when the contracts were just rebound", async () => {
    const result = await run({ expected: async () => named([other, other, other]) });
    expect(result.report).toMatchObject({ matches: false });
  });
});
