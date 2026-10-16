import { describe, expect, it } from "vitest";
import { PROMISE_TOLERANCE, decideAfterSwap } from "../src/bridge/usdt-execute.ts";
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
