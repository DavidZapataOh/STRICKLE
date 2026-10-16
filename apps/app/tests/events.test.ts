import { type Address, type Hex, encodeAbiParameters, encodeEventTopics, getAddress } from "viem";
import { describe, expect, it } from "vitest";
import { decodeActivity, executorEvents, poolEvents, spentFrom, stateEvents, vaultEvents } from "../src/activity/events.ts";
import { withRetry } from "../src/activity/read.ts";
import type { RawLog } from "../src/chain/logs.ts";

const a = (n: number) => getAddress(`0x${n.toString(16).padStart(40, "0")}`);
const vault = a(0xa1);
const tx = (n: number): Hex => `0x${n.toString(16).padStart(64, "0")}`;
const log = (topics: readonly (Hex | Hex[] | null)[], data: Hex, transactionHash: Hex, blockNumber: bigint, logIndex: number, timestamp = 1_800_000_000): RawLog => ({ topics: [...topics] as Hex[], data, transactionHash, blockNumber, logIndex, timestamp });

const split = (txHash: Hex, amount: bigint, logIndex = 5) =>
  log(encodeEventTopics({ abi: executorEvents, eventName: "Split", args: { vault, asset: 1 } }), encodeAbiParameters([{ type: "uint256" }], [amount]), txHash, 100n, logIndex);
const allocated = (txHash: Hex, box: number, amount: bigint, logIndex: number) =>
  log(encodeEventTopics({ abi: vaultEvents, eventName: "Allocated", args: { asset: 1, box } }), encodeAbiParameters([{ type: "uint256" }, { type: "uint256" }], [amount, amount]), txHash, 100n, logIndex);
const salary = (txHash: Hex, amount: bigint) =>
  log(encodeEventTopics({ abi: executorEvents, eventName: "SalaryPaid", args: { vault, asset: 1, payee: a(0xb2) } }), encodeAbiParameters([{ type: "uint256" }], [amount]), txHash, 120n, 2);
const privateSpend = (txHash: Hex) =>
  log(encodeEventTopics({ abi: executorEvents, eventName: "PrivateSpend", args: { vault } }), encodeAbiParameters([{ type: "uint256" }], [99n]), txHash, 130n, 3);
const notice = (id: bigint, sealed: Hex) =>
  log(encodeEventTopics({ abi: stateEvents, eventName: "Notice", args: { vault, id } }), encodeAbiParameters([{ type: "bytes" }], [sealed]), tx(900), 140n, 7);

const none = new Map<Hex, { amount: bigint; recipient: Address }>();

describe("decodeActivity", () => {
  it("builds a split receipt with the amount that went into each box", () => {
    const out = decodeActivity({ executor: [split(tx(1), 1_000_000n)], allocated: [allocated(tx(1), 1, 200_000n, 3), allocated(tx(1), 4, 600_000n, 4), allocated(tx(1), 6, 200_000n, 6)], spent: none, state: [] });
    expect(out.receipts).toEqual([{ type: "split", vault, asset: 1, total: 1_000_000n, byBox: { taxes: 200_000n, operating: 600_000n, profit: 200_000n }, txHash: tx(1), blockNumber: 100n, logIndex: 5, timestamp: 1_800_000_000 }]);
  });

  it("ignores allocations that belong to another transaction (the owner allocating by hand)", () => {
    const out = decodeActivity({ executor: [split(tx(1), 500n)], allocated: [allocated(tx(2), 3, 500n, 1)], spent: none, state: [] });
    expect(out.receipts[0]).toMatchObject({ type: "split", byBox: {} });
  });

  it("decodes a salary payment with its payee", () => {
    const out = decodeActivity({ executor: [salary(tx(3), 1_800_000_000n)], allocated: [], spent: none, state: [] });
    expect(out.receipts).toEqual([{ type: "salary", vault, asset: 1, payee: a(0xb2), amount: 1_800_000_000n, txHash: tx(3), blockNumber: 120n, logIndex: 2, timestamp: 1_800_000_000 }]);
  });

  it("shows a private spend only when the pool's Spent event was found in the same transaction", () => {
    const spent = new Map([[tx(4), { amount: 300_000n, recipient: a(0xb2) }]]);
    expect(decodeActivity({ executor: [privateSpend(tx(4))], allocated: [], spent, state: [] }).receipts).toEqual([
      { type: "private-spend", vault, amount: 300_000n, recipient: a(0xb2), txHash: tx(4), blockNumber: 130n, logIndex: 3, timestamp: 1_800_000_000 },
    ]);
    expect(decodeActivity({ executor: [privateSpend(tx(5))], allocated: [], spent, state: [] }).receipts).toEqual([]);
  });

  it("returns sealed notices untouched, in id order", () => {
    const out = decodeActivity({ executor: [], allocated: [], spent: none, state: [notice(2n, "0xbb"), notice(1n, "0xaa")] });
    expect(out.notices.map((item) => [item.id, item.sealed])).toEqual([[1n, "0xaa"], [2n, "0xbb"]]);
  });

  it("skips a log it does not recognize instead of failing the whole read", () => {
    const stray = log([tx(777)], "0x", tx(8), 1n, 0);
    expect(decodeActivity({ executor: [stray, split(tx(1), 5n)], allocated: [], spent: none, state: [] }).receipts).toHaveLength(1);
  });
});

describe("spentFrom", () => {
  const pool = a(0xcc);
  const spent = {
    address: pool,
    topics: encodeEventTopics({ abi: poolEvents, eventName: "Spent", args: { asset: 1, recipient: a(0xb2) } }) as Hex[],
    data: encodeAbiParameters([{ type: "uint256" }, { type: "uint256" }, { type: "uint64" }], [99n, 100n, 300_000n]),
  };

  it("reads the public payment from the pool's Spent event of the same transaction", () => {
    expect(spentFrom([spent], pool)).toEqual({ amount: 300_000n, recipient: a(0xb2) });
  });

  it("ignores a Spent-shaped event emitted by another contract", () => {
    expect(spentFrom([{ ...spent, address: a(0xdd) }], pool)).toBeUndefined();
  });
});

describe("withRetry", () => {
  const rateLimited = () => Object.assign(new Error("rate limit exceeded"), { code: -32005 });

  it("retries a rate limit with growing waits and then succeeds", async () => {
    const waits: number[] = [];
    let calls = 0;
    const value = await withRetry(async () => {
      calls += 1;
      if (calls < 3) throw rateLimited();
      return "ok";
    }, { tries: 5, baseMs: 100, sleep: async (ms) => void waits.push(ms) });
    expect(value).toBe("ok");
    expect(waits).toEqual([100, 200]);
  });

  it("gives up after the last try and never retries an unrelated error", async () => {
    await expect(withRetry(async () => { throw rateLimited(); }, { tries: 2, baseMs: 1, sleep: async () => undefined })).rejects.toThrow("rate limit");
    let calls = 0;
    await expect(withRetry(async () => { calls += 1; throw new Error("boom"); }, { tries: 5, baseMs: 1, sleep: async () => undefined })).rejects.toThrow("boom");
    expect(calls).toBe(1);
  });
});
