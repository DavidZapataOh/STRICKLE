// workflows/agent/tests/books.test.ts
import { describe, expect, it } from "vitest";
import { type Hex, encodeAbiParameters, encodeFunctionData, encodeFunctionResult, getAddress, keccak256, parseAbi, toBytes } from "viem";
import {
  booksRequests,
  decodeBooks,
  decodeDelegated,
  decodeHead,
  decodeNoticeCount,
  decodePending,
  decodeStateLog,
  decodeTickBooks,
  delegatedRequest,
  headRequest,
  noticeCountRequest,
  onePerVault,
  pendingRequest,
  stateLogRequest,
  tickRequests,
} from "../enclave/books.ts";

const executor = "0x00000000000000000000000000000000000000dd";
const state = "0x00000000000000000000000000000000000000cc";
const vault = getAddress("0x00000000000000000000000000000000000000a1");

const executorAbi = parseAbi(["function pending(uint256 seed, uint256 maxHits) view returns ((address vault, uint8 asset, uint256 amount)[])"]);
const vaultAbi = parseAbi(["function boxBalance(uint8 asset, uint8 box) view returns (uint256)"]);
const stateAbi = parseAbi(["function head(address vault) view returns (uint64 version, uint64 at, uint64 applied)"]);

describe("pending", () => {
  it("asks the executor at latest and decodes the list", () => {
    expect(pendingRequest(executor, 7, 10)).toMatchObject({ method: "eth_call", params: [{ to: executor }, "latest"] });
    const result = encodeFunctionResult({ abi: executorAbi, functionName: "pending", result: [{ vault, asset: 1, amount: 1_000_000n }] });
    expect(decodePending(result)).toEqual([{ vault, asset: 1, amount: 1_000_000n }]);
  });

  it("keeps one entry per vault so a vault holding both assets gets one report per run", () => {
    const other = getAddress("0x00000000000000000000000000000000000000a2");
    const items = [{ vault, asset: 1, amount: 5n }, { vault, asset: 2, amount: 6n }, { vault: other, asset: 2, amount: 7n }];
    expect(onePerVault(items)).toEqual([items[0], items[2]]);
  });

  it("decodes an empty list", () => {
    expect(decodePending(encodeFunctionResult({ abi: executorAbi, functionName: "pending", result: [] }))).toEqual([]);
  });
});

describe("books", () => {
  it("asks for the head and the three balances the cascade needs, for the right asset", () => {
    const requests = booksRequests(state, vault, 2);
    expect(requests).toHaveLength(4);
    expect(requests[0]).toMatchObject({ params: [{ to: state }, "latest"] });
    const data = requests.slice(1).map((request) => (request.params[0] as { data: Hex }).data);
    expect(data).toEqual([4, 2, 5].map((box) => encodeFunctionData({ abi: vaultAbi, functionName: "boxBalance", args: [2, box] })));
  });

  it("decodes the answers in order", () => {
    const head = encodeFunctionResult({ abi: stateAbi, functionName: "head", result: [3n, 90n, 2n] });
    const balance = (value: bigint) => encodeFunctionResult({ abi: vaultAbi, functionName: "boxBalance", result: value });
    expect(decodeBooks([head, balance(840_000n), balance(5n), balance(7n)])).toEqual({
      version: 3n,
      at: 90n,
      applied: 2n,
      operating: 840_000n,
      payrollFunded: 5n,
      emergency: 7n,
    });
  });
});

describe("state log", () => {
  it("filters on the event, the vault and the version at exactly the head block", () => {
    const request = stateLogRequest(state, vault, 3n, 90n);
    const filter = (request.params[0] as { fromBlock: string; toBlock: string; topics: string[] });
    expect([filter.fromBlock, filter.toBlock]).toEqual(["0x5a", "0x5a"]);
    expect(filter.topics[0]).toBe(keccak256(toBytes("StateUpdated(address,uint64,bytes)")));
    expect(filter.topics).toHaveLength(3);
  });

  it("extracts the ciphertext from the log data", () => {
    const data = encodeAbiParameters([{ type: "bytes" }], ["0xc1f7"]);
    expect(decodeStateLog([{ data, topics: [] }])).toEqual(Uint8Array.of(0xc1, 0xf7));
  });

  it("refuses when the head block has no matching log", () => {
    expect(() => decodeStateLog([])).toThrow(/^no log$/);
  });
});

describe("tick reads", () => {
  const vaultAbi = parseAbi([
    "function boxBalance(uint8 asset, uint8 box) view returns (uint256)",
    "function invested(uint8 asset, uint8 box) view returns (uint256)",
    "function unallocated(uint8 asset) view returns (uint256)",
  ]);
  const executorAbi = parseAbi(["function delegated(uint256 seed, uint256 maxHits) view returns (address[])"]);

  it("lists the delegated vaults", () => {
    expect(delegatedRequest(executor, 7, 10)).toMatchObject({ method: "eth_call", params: [{ to: executor }, "latest"] });
    expect(decodeDelegated(encodeFunctionResult({ abi: executorAbi, functionName: "delegated", result: [vault] }))).toEqual([vault]);
  });

  it("reads the head of a vault's state", () => {
    expect(headRequest(state, vault)).toMatchObject({ method: "eth_call", params: [{ to: state }, "latest"] });
    expect(decodeHead(encodeFunctionResult({ abi: stateAbi, functionName: "head", result: [3n, 90n, 2n] }))).toEqual({ version: 3n, at: 90n, applied: 2n });
  });

  it("asks for the head, six balances, six invested amounts and the unallocated amount in USDC", () => {
    const requests = tickRequests(state, vault);
    expect(requests).toHaveLength(15);
    const data = requests.slice(1).map((request) => (request.params[0] as { data: Hex }).data);
    expect(data.slice(0, 6)).toEqual([1, 2, 3, 4, 5, 6].map((box) => encodeFunctionData({ abi: vaultAbi, functionName: "boxBalance", args: [1, box] })));
    expect(data.slice(6, 12)).toEqual([1, 2, 3, 4, 5, 6].map((box) => encodeFunctionData({ abi: vaultAbi, functionName: "invested", args: [1, box] })));
    expect(data[12]).toBe(encodeFunctionData({ abi: vaultAbi, functionName: "unallocated", args: [1] }));
  });

  it("decodes the answers into the planner's books", () => {
    const head = encodeFunctionResult({ abi: stateAbi, functionName: "head", result: [3n, 90n, 2n] });
    const word = (value: bigint) => encodeFunctionResult({ abi: vaultAbi, functionName: "boxBalance", result: value });
    const answers = [head, ...[1n, 2n, 3n, 4n, 5n, 6n].map(word), ...[0n, 0n, 0n, 9n, 0n, 0n].map(word), word(77n), encodeFunctionResult({ abi: parseAbi(["function noticeCount(address) view returns (uint64)"]), functionName: "noticeCount", result: 0n })];
    const decoded = decodeTickBooks(answers);
    expect(decoded).toMatchObject({ version: 3n, at: 90n, applied: 2n });
    expect(decoded.books.boxes).toEqual({ taxes: 1n, payroll: 2n, salary: 3n, operating: 4n, emergency: 5n, profit: 6n });
    expect(decoded.books.invested.operating).toBe(9n);
    expect(decoded.books.unallocated).toBe(77n);
  });
});

describe("tick reads with the notice count", () => {
  it("has 15 requests, the last being noticeCount, and decodes the count next to the books", () => {
    const requests = tickRequests(state, vault);
    expect(requests).toHaveLength(15);
    const word = (value: bigint) => encodeFunctionResult({ abi: parseAbi(["function boxBalance(uint8 asset, uint8 box) view returns (uint256)"]), functionName: "boxBalance", result: value });
    const head = encodeFunctionResult({ abi: stateAbi, functionName: "head", result: [3n, 90n, 2n] });
    const count = encodeFunctionResult({ abi: parseAbi(["function noticeCount(address) view returns (uint64)"]), functionName: "noticeCount", result: 4n });
    const answers = [head, ...Array.from({ length: 13 }, () => word(0n)), count];
    expect(decodeTickBooks(answers).notices).toBe(4n);
  });
});

describe("notice count", () => {
  it("reads noticeCount(vault) from the state contract", () => {
    expect(noticeCountRequest(state, vault)).toMatchObject({ method: "eth_call", params: [{ to: state }, "latest"] });
    expect(decodeNoticeCount(encodeFunctionResult({ abi: parseAbi(["function noticeCount(address) view returns (uint64)"]), functionName: "noticeCount", result: 4n }))).toBe(4n);
  });
});
