import { readFileSync } from "node:fs";
import { encodeAbiParameters, encodeEventTopics, parseAbi } from "viem";
import { describe, expect, it } from "vitest";
import { MAX_LOG_SPAN, RACE_BLOCKS, arrivalId, attribute, decodeMoves, decodeTransfers, logWindow, transfersRequest, vaultMovesRequest } from "../enclave/flow.ts";

const USDC = "0x3600000000000000000000000000000000000000" as const;
const VAULT = "0x8AB41267Adc223EF245c46537870Ae8744b9b3F8" as const;
const real = JSON.parse(readFileSync(new URL("./fixtures/transfers/usdc-transfers.json", import.meta.url), "utf8"));
const both = JSON.parse(readFileSync(new URL("./fixtures/transfers/double-emitter.json", import.meta.url), "utf8"));

describe("transfersRequest", () => {
  it("asks the token's Transfer logs addressed to the vault, between two blocks", () => {
    const request = transfersRequest(USDC, VAULT, 100n, 200n);
    expect(request.method).toBe("eth_getLogs");
    const [filter] = request.params as [{ address: string; topics: (string | null)[]; fromBlock: string; toBlock: string }];
    expect(filter.address.toLowerCase()).toBe(USDC);
    expect(filter.topics[0]).toBe("0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef");
    expect(filter.topics[1]).toBeNull();
    expect(filter.topics[2]?.toLowerCase()).toBe(`0x${VAULT.slice(2).toLowerCase().padStart(64, "0")}`);
    expect([filter.fromBlock, filter.toBlock]).toEqual(["0x64", "0xc8"]);
  });
});

describe("decodeTransfers on real Arc logs", () => {
  const transfers = decodeTransfers(real.logs, USDC, "USDC");

  it("reads the sender, the amount and the position of every transfer, oldest first", () => {
    expect(transfers.length).toBe(real.logs.length);
    for (const transfer of transfers) {
      expect(transfer.amount).toBeGreaterThan(0n);
      expect(transfer.sender).toMatch(/^0x[0-9a-fA-F]{40}$/);
    }
    const order = transfers.map((t) => [t.block, t.logIndex] as const);
    expect(order).toEqual([...order].sort((a, b) => (a[0] === b[0] ? a[1] - b[1] : a[0] < b[0] ? -1 : 1)));
  });

  it("counts a credit once even when Arc also emitted the system duplicate in the same transaction", () => {
    expect(both.logs.length).toBeGreaterThanOrEqual(2);
    const counted = decodeTransfers(both.logs, USDC, "USDC");
    const tokenOwn = both.logs.filter((log: { address: string }) => log.address.toLowerCase() === USDC);
    expect(counted).toHaveLength(tokenOwn.length);
  });

  it("gives every transfer a stable ten-character id built from its transaction and position", () => {
    const [first] = transfers;
    expect(first && arrivalId(first.txHash, first.logIndex)).toBe(first?.id);
    expect(first?.id).toMatch(/^[0-9a-f]{10}$/);
    expect(new Set(transfers.map((t) => t.id)).size).toBe(transfers.length);
  });

  it("returns nothing for a malformed answer instead of throwing in the middle of a batch", () => {
    expect(decodeTransfers(null, USDC, "USDC")).toEqual([]);
    expect(decodeTransfers([{ topics: [], data: "0x" }], USDC, "USDC")).toEqual([]);
  });
});

describe("conversions and redemptions are not arrivals", () => {
  // No Redeemed or Swapped event exists yet on the shared test vault, so the logs are built with viem's own encoder from the contract's event ABI; replace them with captured logs once a real one exists.
  const redeemed = parseAbi(["event Redeemed(uint8 indexed asset, uint8 indexed box, address indexed vault, uint256 shares, uint256 assets)"]);
  const logOf = (txHash: string) => ({ address: VAULT, topics: encodeEventTopics({ abi: redeemed, eventName: "Redeemed", args: { asset: 1, box: 4, vault: VAULT } }), data: encodeAbiParameters([{ type: "uint256" }, { type: "uint256" }], [1n, 2n]), transactionHash: txHash, blockNumber: "0x10", logIndex: "0x1" });

  it("asks the vault's Redeemed and Swapped events in one request", () => {
    const request = vaultMovesRequest(VAULT, 100n, 200n);
    expect(request.method).toBe("eth_getLogs");
    const [filter] = request.params as [{ address: string; topics: (string | string[] | null)[] }];
    expect(filter.address.toLowerCase()).toBe(VAULT.toLowerCase());
    expect(Array.isArray(filter.topics[0]) && filter.topics[0].length).toBe(2);
  });

  it("reads the transactions of those events and drops the credits that came with them", () => {
    const moves = decodeMoves([logOf(`0x${"ab".repeat(32)}`)]);
    expect(moves.has(`0x${"ab".repeat(32)}`)).toBe(true);
    const own = real.logs.at(-1);
    const dropped = decodeTransfers(real.logs, USDC, "USDC", new Set([own.transactionHash]));
    expect(dropped.every((transfer) => transfer.txHash !== own.transactionHash)).toBe(true);
    expect(dropped.length).toBeLessThan(decodeTransfers(real.logs, USDC, "USDC").length);
  });
});

describe("attribute", () => {
  const t = (n: number, amount: bigint) => ({ id: `0000000${n}`.slice(-10), asset: "USDC" as const, amount, sender: VAULT, block: BigInt(n), txHash: `0x${String(n).repeat(64).slice(0, 64)}` as const, logIndex: 0 });

  it("explains the balance exactly when the logs add up to it", () => {
    expect(attribute({ transfers: [t(1, 100n), t(2, 250n)], unallocated: 350n, head: 10n })).toEqual({ arrivals: [t(1, 100n), t(2, 250n)], unexplained: 0n, checkpoint: 10n });
  });

  it("leaves what no log explains as an unexplained remainder", () => {
    expect(attribute({ transfers: [t(1, 100n)], unallocated: 350n, head: 10n })).toMatchObject({ unexplained: 250n });
    expect(attribute({ transfers: [], unallocated: 350n, head: 10n })).toMatchObject({ arrivals: [], unexplained: 350n });
  });

  it("answers 'race' when the newest log is too fresh to be sure the balance read has caught up, so nothing is misattributed", () => {
    expect(attribute({ transfers: [t(1, 100n), t(2, 250n)], unallocated: 300n, head: 10n })).toBe("race");
  });

  it("does not wait forever: logs that exceed the balance long after they landed mean something else moved the money, so the whole balance is income nobody can attribute", () => {
    const stuck = attribute({ transfers: [t(1, 100n), t(2, 250n)], unallocated: 300n, head: 2n + RACE_BLOCKS + 1n });
    expect(stuck).toEqual({ arrivals: [], unexplained: 300n, checkpoint: 2n + RACE_BLOCKS + 1n });
  });
});

describe("logWindow", () => {
  it("reads from the block after the checkpoint when the backlog fits in one read", () => {
    expect(logWindow(10_000n, 9_000n)).toBe(9_000n);
  });
  it("never reaches further back than the widest read the RPC accepts", () => {
    for (const since of [0n, 1n, 9_999n]) {
      const from = logWindow(200_000n + since, since);
      expect(200_000n + since - from + 1n).toBeLessThanOrEqual(MAX_LOG_SPAN);
    }
    expect(logWindow(100_000n, 1n)).toBe(100_000n - MAX_LOG_SPAN + 1n);
  });
  it("accepts a span of exactly the limit", () => {
    expect(logWindow(MAX_LOG_SPAN, 1n)).toBe(1n);
  });
});
