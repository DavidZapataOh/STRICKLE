import { describe, expect, it } from "vitest";
import { type DepositState, depositReducer, initialDeposit } from "../src/deposit/flow.ts";
import { PENDING_KEY, clearPending, loadPending, savePending } from "../src/deposit/pending.ts";

const wallet = { uuid: "a", name: "Alpha", icon: "data:image/png;base64,AA==", rdns: "io.alpha", provider: {} as never };
const quote = { exact: true, expiresAt: 1, legs: [], amountSent: 5n, totalDebit: 6n, amountReceivedMin: 5n, network: "testnet", sourceAddress: "0x1", vault: "0x2", opaque: null } as never;
const run = (events: Parameters<typeof depositReducer>[1][], from: DepositState = initialDeposit("testnet")) => events.reduce(depositReducer, from);

describe("the deposit flow", () => {
  it("walks chain, wallet, quote, sending, waiting, arrived", () => {
    const state = run([{ type: "chain", id: "Base_Sepolia" }, { type: "amount", value: 5_000_000n }, { type: "wallet", wallet, account: "0xabc" as never }, { type: "quoted", quote }, { type: "sending", depositId: "d1" }, { type: "burned", burnTx: "0xb" as never }, { type: "arrived", received: 5_000_000n }]);
    expect(state.step).toBe("arrived");
    expect(state.received).toBe(5_000_000n);
  });

  it("does not move to the wallet step without a chain and an amount", () => {
    const state = run([{ type: "wallet", wallet, account: "0xabc" as never }]);
    expect(state.step).toBe("chain");
  });

  it("asks for a new quote when the user changes the amount, the chain or the speed after quoting", () => {
    const quoted = run([{ type: "chain", id: "Base_Sepolia" }, { type: "amount", value: 5_000_000n }, { type: "wallet", wallet, account: "0xabc" as never }, { type: "quoted", quote }]);
    for (const event of [{ type: "amount", value: 6_000_000n }, { type: "chain", id: "Avalanche_Fuji" }, { type: "speed", value: "slow" }] as const) {
      const changed = depositReducer(quoted, event);
      expect(changed.quote).toBeNull();
      expect(changed.step).toBe("wallet");
    }
  });

  it("keeps the burn hash on a failure after the burn, so the deposit can still be followed", () => {
    const state = run([{ type: "chain", id: "Base_Sepolia" }, { type: "amount", value: 5_000_000n }, { type: "wallet", wallet, account: "0xabc" as never }, { type: "quoted", quote }, { type: "sending", depositId: "d1" }, { type: "burned", burnTx: "0xb" as never }, { type: "failed", error: "timeout" }]);
    expect(state.step).toBe("failed");
    expect(state.burnTx).toBe("0xb");
  });

  it("a rejected signature returns to the quote, not to a dead end", () => {
    const state = run([{ type: "chain", id: "Base_Sepolia" }, { type: "amount", value: 5_000_000n }, { type: "wallet", wallet, account: "0xabc" as never }, { type: "quoted", quote }, { type: "sending", depositId: "d1" }, { type: "failed", error: "rejected" }]);
    expect(state.step).toBe("quote");
    expect(state.error).toBe("rejected");
  });

  it("remembers the speed Circle applied, which may differ from the one asked for", () => {
    const waiting = run([{ type: "chain", id: "Base_Sepolia" }, { type: "amount", value: 5_000_000n }, { type: "wallet", wallet, account: "0xabc" as never }, { type: "quoted", quote }, { type: "sending", depositId: "d1" }, { type: "burned", burnTx: "0xb" as never }, { type: "speed-applied", value: "slow" }]);
    expect(waiting.speed).toBe("fast");
    expect(waiting.appliedSpeed).toBe("slow");
  });
});

describe("the pending deposit that survives a reload", () => {
  const memory = () => {
    const data = new Map<string, string>();
    return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v), removeItem: (k: string) => void data.delete(k) } as unknown as Storage;
  };
  it("round-trips, and ignores a corrupted entry", () => {
    const storage = memory();
    const burn = `0x${"ab".repeat(32)}` as const;
    savePending("11111111-1111-4111-8111-111111111111", burn, storage);
    expect(loadPending(storage)).toEqual({ id: "11111111-1111-4111-8111-111111111111", burnTx: burn });
    storage.setItem(PENDING_KEY, "{not json");
    expect(loadPending(storage)).toBeNull();
    clearPending(storage);
    expect(loadPending(storage)).toBeNull();
  });
  it("survives a browser without storage", () => {
    expect(loadPending(null)).toBeNull();
    expect(() => savePending("x", "0x" as never, null)).not.toThrow();
  });
});
