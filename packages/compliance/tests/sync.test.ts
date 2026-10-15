import { type ChildProcess, execFileSync, spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { type Address, type Hex, createPublicClient, createWalletClient, defineChain, getAddress, http, parseAbi } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { evidenceHash, screeningAbi, syncScreening } from "../src/sync.ts";

const PORT = 8563;
const RPC = `http://127.0.0.1:${PORT}`;
const chain = defineChain({ id: 31337, name: "local", nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 }, rpcUrls: { default: { http: [RPC] } } });
const account = privateKeyToAccount("0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80");
const artifact = JSON.parse(readFileSync(new URL("../../../contracts/out/ScreeningRegistry.sol/ScreeningRegistry.json", import.meta.url), "utf8"));
const TTL = 1_000n;

let node: ChildProcess;
const makeClients = () => ({
  publicClient: createPublicClient({ chain, transport: http(RPC) }),
  walletClient: createWalletClient({ account, chain, transport: http(RPC) }),
});
let publicClient: ReturnType<typeof makeClients>["publicClient"];
let walletClient: ReturnType<typeof makeClients>["walletClient"];
let registry: Address;
const who = (n: number) => getAddress(`0x${n.toString(16).padStart(40, "0")}`);
const events = parseAbi(["event RiskSet(address indexed who, uint8 risk, uint64 screenedAt, bytes32 evidence)"]);

beforeAll(async () => {
  node = spawn("arc-anvil", ["--network", "arc", "--port", String(PORT)], { stdio: "ignore" });
  for (let attempt = 0; attempt < 50; attempt++) {
    try {
      execFileSync("arc-cast", ["chain-id", "--rpc-url", RPC], { stdio: "ignore" });
      break;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }
  ({ publicClient, walletClient } = makeClients());
  const hash = await walletClient.deployContract({ abi: artifact.abi, bytecode: artifact.bytecode.object as Hex, args: [account.address, TTL] } as never);
  registry = (await publicClient.waitForTransactionReceipt({ hash })).contractAddress as Address;
  await publicClient.waitForTransactionReceipt({ hash: await walletClient.writeContract({ address: registry, abi: artifact.abi, functionName: "setScreener", args: [account.address, true] } as never) });
});

afterAll(() => {
  node?.kill();
});

const args = (desired: Map<Address, 0 | 1 | 2>, extra: Record<string, unknown> = {}) => ({ publicClient, walletClient, registry, desired, evidence: evidenceHash({ n: desired.size }), ...extra });
const statusOf = (address: Address) => publicClient.readContract({ address: registry, abi: screeningAbi, functionName: "status", args: [address] });
const advance = async (seconds: number) => {
  await publicClient.request({ method: "evm_increaseTime" as never, params: [seconds] as never });
  await publicClient.request({ method: "evm_mine" as never, params: [] as never });
};

describe("registry sync", () => {
  it("writes every difference once and nothing the second time", async () => {
    const desired = new Map<Address, 0 | 1 | 2>([[who(1), 2], [who(2), 1], [who(3), 0]]);
    expect(await syncScreening(args(desired))).toEqual({ written: 3, skipped: 0 });
    expect(await statusOf(who(1))).toEqual([2, true]);
    expect(await statusOf(who(2))).toEqual([1, true]);
    expect(await statusOf(who(3))).toEqual([0, true]);
    expect(await syncScreening(args(desired))).toEqual({ written: 0, skipped: 3 });
  });

  it("writes a changed tier and leaves the others alone", async () => {
    const desired = new Map<Address, 0 | 1 | 2>([[who(1), 2], [who(2), 2], [who(3), 0]]);
    expect(await syncScreening(args(desired))).toEqual({ written: 1, skipped: 2 });
    expect(await statusOf(who(2))).toEqual([2, true]);
  });

  it("refreshes records within a quarter of the TTL of expiring by default so continuous screening never lapses", async () => {
    const desired = new Map<Address, 0 | 1 | 2>([[who(3), 0]]);
    await advance(Number(TTL) - 100);
    expect(await syncScreening(args(desired, { refreshMargin: 50 }))).toEqual({ written: 0, skipped: 1 });
    expect(await syncScreening(args(desired))).toEqual({ written: 1, skipped: 0 });
    expect((await statusOf(who(3)))[1]).toBe(true);
  });

  it("refreshes a record that already expired", async () => {
    const desired = new Map<Address, 0 | 1 | 2>([[who(3), 0]]);
    await advance(Number(TTL) + 10);
    expect((await statusOf(who(3)))[1]).toBe(false);
    expect(await syncScreening(args(desired))).toEqual({ written: 1, skipped: 0 });
    expect((await statusOf(who(3)))[1]).toBe(true);
  });

  it("splits large updates into batches of at most 200 and records the evidence", async () => {
    const desired = new Map<Address, 0 | 1 | 2>();
    for (let i = 0; i < 450; i++) desired.set(who(10_000 + i), 2);
    const evidence = evidenceHash({ list: "ofac", count: 450 });
    const before = await publicClient.getBlockNumber({ cacheTime: 0 });
    expect(await syncScreening(args(desired, { evidence }))).toEqual({ written: 450, skipped: 0 });
    const logs = await publicClient.getLogs({ address: registry, event: events[0], fromBlock: before + 1n });
    expect(logs).toHaveLength(450);
    expect(new Set(logs.map((log) => log.args.evidence))).toEqual(new Set([evidence]));
    const blocks = new Set(logs.map((log) => log.blockNumber));
    expect(blocks.size).toBe(3);
  });

  it("does nothing for an empty table", async () => {
    expect(await syncScreening(args(new Map()))).toEqual({ written: 0, skipped: 0 });
  });

  it("hashes reports canonically, whatever the key order", () => {
    expect(evidenceHash({ a: 1, b: { c: 2, d: [3, 4] } })).toBe(evidenceHash({ b: { d: [3, 4], c: 2 }, a: 1 }));
    expect(evidenceHash({ a: 1 })).not.toBe(evidenceHash({ a: 2 }));
    expect(evidenceHash({ a: 1 })).toMatch(/^0x[0-9a-f]{64}$/);
  });
});
