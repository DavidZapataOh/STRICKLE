import type { Address, PublicClient } from "viem";
import { describe, expect, it } from "vitest";
import { agentActivity, contractsReport, explorerVerified } from "../src/server/proof.ts";

const a = (n: number) => `0x${n.toString(16).padStart(40, "0")}` as Address;
const manifest = { BoxVault: { address: a(1) }, BoxVaultFactory: { address: a(2) }, AgentExecutor: { address: a(3) } };
const clientWith = (code: Record<string, string>) => ({ getCode: async ({ address }: { address: string }) => code[address.toLowerCase()] }) as unknown as PublicClient;

describe("contractsReport", () => {
  it("marks a contract with no code at its address as not deployed, and never as verified", async () => {
    const rows = await contractsReport({ manifest, client: clientWith({ [a(1)]: "0x6080", [a(2)]: "0x", [a(3)]: undefined as never }), explorer: async () => true });
    expect(rows).toEqual([
      { name: "BoxVault", address: a(1), deployed: true, verified: true },
      { name: "BoxVaultFactory", address: a(2), deployed: false, verified: null },
      { name: "AgentExecutor", address: a(3), deployed: false, verified: null },
    ]);
  });

  it("reports the three states of the explorer for deployed contracts: verified, not verified and unknown", async () => {
    const answers: Record<string, boolean | null> = { [a(1)]: true, [a(2)]: false, [a(3)]: null };
    const rows = await contractsReport({ manifest, client: clientWith({ [a(1)]: "0x60", [a(2)]: "0x60", [a(3)]: "0x60" }), explorer: async (address) => answers[address] ?? null });
    expect(rows.map((row) => row.verified)).toEqual([true, false, null]);
  });

  it("keeps the whole report when reading one contract's code fails", async () => {
    const client = { getCode: async ({ address }: { address: string }) => { if (address.toLowerCase() === a(2)) throw new Error("rate limited"); return "0x60"; } } as unknown as PublicClient;
    const rows = await contractsReport({ manifest, client, explorer: async () => true });
    expect(rows.map((row) => row.deployed)).toEqual([true, false, true]);
  });
});

describe("explorerVerified", () => {
  const answer = (body: unknown, status = 200) => async () => new Response(JSON.stringify(body), { status });
  it("reads is_verified from the explorer's real shape", async () => {
    expect(await explorerVerified("https://x.test", a(1), answer({ is_verified: true }))).toBe(true);
    expect(await explorerVerified("https://x.test", a(1), answer({ is_verified: false }))).toBe(false);
  });

  it("is unknown, never a guess, for a failure, a bad body and a thrown fetch", async () => {
    expect(await explorerVerified("https://x.test", a(1), answer({}, 500))).toBeNull();
    expect(await explorerVerified("https://x.test", a(1), answer({ nope: 1 }))).toBeNull();
    expect(await explorerVerified("https://x.test", a(1), answer("text"))).toBeNull();
    expect(await explorerVerified("https://x.test", a(1), async () => { throw new Error("offline"); })).toBeNull();
  });

  it("asks the explorer for exactly that address", async () => {
    const urls: string[] = [];
    await explorerVerified("https://x.test", a(1), async (url) => { urls.push(String(url)); return new Response("{}"); });
    expect(urls).toEqual([`https://x.test/api/v2/smart-contracts/${a(1)}`]);
  });
});

describe("agentActivity", () => {
  const withLogs = (logs: { blockNumber: bigint; transactionHash: string }[]) =>
    ({
      getBlockNumber: async () => 1_000_000n,
      getLogs: async () => logs,
      getBlock: async ({ blockNumber }: { blockNumber: bigint }) => ({ timestamp: blockNumber * 2n }),
    }) as unknown as PublicClient;

  it("is the time and transaction of the newest write", async () => {
    const result = await agentActivity(withLogs([{ blockNumber: 10n, transactionHash: "0xaa" }, { blockNumber: 30n, transactionHash: "0xbb" }]), a(9));
    expect(result).toEqual({ lastWriteAt: 60, lastTx: "0xbb" });
  });

  it("says there has been none yet, and survives a failing read", async () => {
    expect(await agentActivity(withLogs([]), a(9))).toEqual({ lastWriteAt: null, lastTx: null });
    const broken = { getBlockNumber: async () => { throw new Error("down"); } } as unknown as PublicClient;
    expect(await agentActivity(broken, a(9))).toEqual({ lastWriteAt: null, lastTx: null });
  });
});
