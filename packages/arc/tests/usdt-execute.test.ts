import { describe, expect, it } from "vitest";
import { encodeAbiParameters, encodeEventTopics, parseAbi } from "viem";
import { ConvertedNotBridged, PROMISE_TOLERANCE, decideAfterSwap, executeUsdtDeposit } from "../src/bridge/usdt-execute.ts";
import type { DepositQuote } from "../src/bridge/types.ts";

const requote = (min: bigint): DepositQuote => ({ amountReceivedMin: min }) as DepositQuote;

describe("decideAfterSwap", () => {
  it("bridges everything the swap delivered when the second leg still keeps the promise", () => {
    expect(decideAfterSwap({ credited: 99_400_000n, shownMin: 99_300_000n, requoted: requote(99_380_000n) })).toEqual({ action: "bridge", amount: 99_400_000n });
  });

  it("accepts a requote a cent below the promise, and no more", () => {
    expect(decideAfterSwap({ credited: 99_400_000n, shownMin: 99_300_000n, requoted: requote(99_300_000n - PROMISE_TOLERANCE) }).action).toBe("bridge");
    expect(decideAfterSwap({ credited: 99_400_000n, shownMin: 99_300_000n, requoted: requote(99_300_000n - PROMISE_TOLERANCE - 1n) })).toEqual({ action: "hold", held: 99_400_000n });
  });

  it("holds the USDC when the second leg cannot be quoted at all", () => {
    expect(decideAfterSwap({ credited: 99_400_000n, shownMin: 99_300_000n, requoted: null })).toEqual({ action: "hold", held: 99_400_000n });
  });

  it("holds when the swap delivered nothing the receipt can show", () => {
    expect(decideAfterSwap({ credited: 0n, shownMin: 99_300_000n, requoted: null })).toEqual({ action: "hold", held: 0n });
  });
});

describe("executeUsdtDeposit", () => {
  const owner = "0x14b5e469720A4cb071772258D9ac8f0B37Ab8D9A" as const;
  const usdc = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48" as const;
  const source = { id: "Ethereum", label: "Ethereum", chainId: 1, domain: 0, usdc, usdt: { address: "0xdAC17F958D2ee523a2206206994597C13D831ec7" } };
  const quote = {
    network: "mainnet", sourceAddress: owner, vault: "0x8AB41267Adc223EF245c46537870Ae8744b9b3F8", amountSent: 100_000_000n, totalDebit: 100_000_000n, amountReceivedMin: 99_300_000n, exact: false, expiresAt: Date.now() + 60_000, opaque: null,
    legs: [
      { kind: "swap", source, tokenIn: { symbol: "USDT", address: source.usdt.address }, amountIn: 100_000_000n, estimatedOut: 99_800_000n, minOut: 99_400_000n, providerFee: 20_000n, slippageBps: 50, gas: null, route: "r" },
      { kind: "bridge", source, speed: "fast", feeMode: "destination", fees: [], gas: null },
    ],
  } as never;
  const transfer = parseAbi(["event Transfer(address indexed from, address indexed to, uint256 value)"]);
  const receipt = (credited: bigint) => ({ logs: [{ address: usdc, topics: encodeEventTopics({ abi: transfer, eventName: "Transfer", args: { from: "0x0000000000000000000000000000000000000001", to: owner } }), data: encodeAbiParameters([{ type: "uint256" }], [credited]), logIndex: 0 }] });
  // the swap service and the chain are the two boundaries with no testnet counterpart: small stand-ins record what the executor does with them
  const world = (balance: bigint, credited = 99_400_000n) => {
    const calls: string[] = [];
    const client = { readContract: async () => balance, waitForTransactionReceipt: async () => receipt(credited) };
    const swapKit = { swap: async () => (calls.push("swap"), { txHash: `0x${"aa".repeat(32)}` }) };
    const kit = { on: () => {}, estimate: async () => { throw new Error("estimator down"); }, bridge: async () => (calls.push("bridge"), { steps: [] }) };
    return { calls, deps: { swapKit, kit, adapter: {}, client } as never };
  };

  it("refuses before any prompt when the wallet holds less USDT than the amount", async () => {
    const { calls, deps } = world(99_000_000n);
    await expect(executeUsdtDeposit(deps, quote, () => {})).rejects.toMatchObject({ code: "insufficient-balance" });
    expect(calls).toEqual([]);
  });

  it("reports the USDC the receipt credited, and holds it when the transfer can no longer be quoted", async () => {
    const { calls, deps } = world(100_000_000n);
    const progress: unknown[] = [];
    const failure = await executeUsdtDeposit(deps, quote, (event) => progress.push(event)).catch((error) => error);
    expect(failure).toBeInstanceOf(ConvertedNotBridged);
    expect((failure as ConvertedNotBridged).held).toBe(99_400_000n);
    expect(progress).toContainEqual(expect.objectContaining({ stage: "swap", state: "done", amount: 99_400_000n }));
    expect(calls).toEqual(["swap"]);
  });
});
