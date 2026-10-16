import { readFileSync } from "node:fs";
import { encodeAbiParameters, encodeEventTopics, getAddress, parseAbiItem } from "viem";
import { describe, expect, it } from "vitest";
import { type RawLog, parseLogsResponse } from "../src/chain/logs.ts";
import { paymentsFrom } from "../src/chain/payments.ts";

const allocatedEvent = parseAbiItem("event Allocated(uint8 indexed asset, uint8 indexed box, uint256 amount, uint256 newBalance)");
const splitEvent = parseAbiItem("event Split(address indexed vault, uint8 indexed asset, uint256 amount)");
const vault = getAddress("0x00000000000000000000000000000000000000a1");
const tx = (n: number) => `0x${n.toString(16).padStart(64, "0")}` as const;

const allocated = (hash: ReturnType<typeof tx>, block: number, index: number, asset: number, box: number, amount: bigint): RawLog => ({
  blockNumber: BigInt(block), logIndex: index, timestamp: 1_800_000_000 + block, transactionHash: hash,
  topics: encodeEventTopics({ abi: [allocatedEvent], eventName: "Allocated", args: { asset, box } }) as `0x${string}`[],
  data: encodeAbiParameters([{ type: "uint256" }, { type: "uint256" }], [amount, amount]),
});
const split = (hash: ReturnType<typeof tx>, block: number, asset: number, amount: bigint): RawLog => ({
  blockNumber: BigInt(block), logIndex: 0, timestamp: 1_800_000_000 + block, transactionHash: hash,
  topics: encodeEventTopics({ abi: [splitEvent], eventName: "Split", args: { vault, asset } }) as `0x${string}`[],
  data: encodeAbiParameters([{ type: "uint256" }], [amount]),
});

describe("paymentsFrom", () => {
  const logs = [
    allocated(tx(1), 10, 1, 1, 1, 200n), allocated(tx(1), 10, 2, 1, 4, 600n), allocated(tx(1), 10, 3, 1, 6, 200n),
    allocated(tx(2), 20, 1, 1, 3, 500n), allocated(tx(2), 20, 2, 1, 5, 500n),
  ];

  it("groups the allocations of one transaction into one payment with its split by box", () => {
    const [newest, oldest] = paymentsFrom(logs, []);
    expect(newest).toMatchObject({ txHash: tx(2), asset: "USDC", total: 1000n, byBox: { salary: 500n, emergency: 500n }, byAgent: false });
    expect(oldest).toMatchObject({ txHash: tx(1), total: 1000n, byBox: { taxes: 200n, operating: 600n, profit: 200n } });
  });

  it("marks a payment as the agent's when the executor split it", () => {
    const result = paymentsFrom(logs, [split(tx(1), 10, 1, 1000n)]);
    expect(result.find((payment) => payment.txHash === tx(1))?.byAgent).toBe(true);
    expect(result.find((payment) => payment.txHash === tx(2))?.byAgent).toBe(false);
  });

  it("keeps the two stablecoins apart and orders by block then log index, newest first", () => {
    const mixed = [allocated(tx(3), 30, 1, 1, 4, 10n), allocated(tx(3), 30, 2, 2, 4, 20n), allocated(tx(4), 30, 5, 1, 4, 5n)];
    expect(paymentsFrom(mixed, []).map((payment) => `${payment.txHash}:${payment.asset}`)).toEqual([`${tx(4)}:USDC`, `${tx(3)}:EURC`, `${tx(3)}:USDC`]);
  });

  it("returns nothing for no logs, skips an unknown box and a log that does not decode", () => {
    expect(paymentsFrom([], [])).toEqual([]);
    expect(paymentsFrom([allocated(tx(5), 40, 1, 1, 9, 10n)], [])).toEqual([]);
    expect(paymentsFrom([{ ...allocated(tx(6), 41, 1, 1, 1, 10n), data: "0x" }], [])).toEqual([]);
  });
});

describe("paymentsFrom on the explorer's real answer", () => {
  const { logs } = parseLogsResponse(JSON.parse(readFileSync(new URL("./fixtures/allocated.json", import.meta.url), "utf8")));
  const payments = paymentsFrom(logs, []);

  it("adds up: every payment's total is the sum of its boxes", () => {
    expect(payments.length).toBeGreaterThan(0);
    for (const payment of payments) expect(Object.values(payment.byBox).reduce((sum, units) => sum + (units ?? 0n), 0n)).toBe(payment.total);
  });

  it("lists each transaction once per asset, newest first", () => {
    const keys = payments.map((payment) => `${payment.txHash}:${payment.asset}`);
    expect(new Set(keys).size).toBe(keys.length);
    const times = payments.map((payment) => payment.at);
    expect(times).toEqual([...times].sort((a, b) => b - a));
  });
});
