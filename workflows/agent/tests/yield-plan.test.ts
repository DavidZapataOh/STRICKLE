import { encodeFunctionResult, parseAbi } from "viem";
import { describe, expect, it } from "vitest";
import { decodeHoldings, holdingsReads } from "../enclave/earn-reads.ts";
import { WHOLE_EXIT, exitIntents } from "../enclave/yield-plan.ts";
import { profileOf } from "./support.ts";

const EARN = "0xAabbeF1D3971c710276ed41eC791BbE14CdB8E88" as const;
const NOW = 1_790_000_000;
const names = { [EARN.toLowerCase()]: { address: EARN, name: "EarnKit USDC Vault" } };
const exit = (over: Record<string, unknown> = {}) => ({ profile: profileOf(), anomalies: [{ id: EARN.toLowerCase(), reason: "price-drop" as const }], shares: { [EARN.toLowerCase()]: { profit: 3n * 10n ** 18n, taxes: 10n ** 18n } }, vaults: names, now: NOW, day: "2026-11-02", ...over });

describe("exitIntents", () => {
  it("asks for the whole position of every box that holds shares in a vault that misbehaves, and says why", () => {
    const { next, notices } = exitIntents(exit());
    expect(next.earn.pending.map((entry) => [entry.box, entry.deposit, entry.auto, entry.vault, entry.amount])).toEqual([
      ["profit", false, true, EARN, WHOLE_EXIT],
      ["taxes", false, true, EARN, WHOLE_EXIT],
    ]);
    expect(notices).toEqual([
      { kind: "yield-exit", box: "profit", name: "EarnKit USDC Vault", reason: "price-drop" },
      { kind: "yield-exit", box: "taxes", name: "EarnKit USDC Vault", reason: "price-drop" },
    ]);
  });

  it("does nothing for a vault the account holds no shares in, or for an anomaly in an unknown vault", () => {
    expect(exitIntents(exit({ shares: {} })).next.earn.pending).toEqual([]);
    expect(exitIntents(exit({ anomalies: [{ id: "0xdead", reason: "inactive" }] })).notices).toEqual([]);
  });

  it("keeps one pending exit per box and vault when the same anomaly is flagged again", () => {
    const first = exitIntents(exit());
    const again = exitIntents(exit({ profile: first.next, now: NOW + 3_600 }));
    expect(again.next.earn.pending).toHaveLength(2);
    expect(again.notices).toEqual([]);
  });

  it("replaces a pending deposit of the same box and vault, because the vault is no longer safe", () => {
    const profile = profileOf({ earn: { pending: [{ id: "i1", box: "profit", vault: EARN, amount: "5", deposit: true, at: NOW - 10 }], failures: 0, heldOn: "" } });
    const { next } = exitIntents(exit({ profile, shares: { [EARN.toLowerCase()]: { profit: 10n ** 18n } } }));
    expect(next.earn.pending.map((entry) => [entry.box, entry.deposit])).toEqual([["profit", false]]);
  });

  it("is not stopped by the agent's own partial withdrawal for the same box: the whole exit replaces it", () => {
    const partial = profileOf({ earn: { pending: [{ id: "a1", box: "profit", vault: EARN, amount: "1010000000", deposit: false, at: NOW - 5, auto: true }], failures: 0, heldOn: "" } });
    const { next, notices } = exitIntents(exit({ profile: partial, shares: { [EARN.toLowerCase()]: { profit: 10n ** 18n } } }));
    expect(next.earn.pending.map((entry) => [entry.box, entry.amount])).toEqual([["profit", WHOLE_EXIT]]);
    expect(notices).toHaveLength(1);
  });

  it("asks for an exit in every box that holds shares, even all five at once", () => {
    const all = { taxes: 1n, payroll: 1n, operating: 1n, emergency: 1n, profit: 1n };
    const { next } = exitIntents(exit({ shares: { [EARN.toLowerCase()]: all } }));
    expect(next.earn.pending).toHaveLength(5);
    expect(next.earn.pending.every((entry) => entry.amount === WHOLE_EXIT)).toBe(true);
  });

  it("tries again at most once a day for an exit that keeps failing, and tells it once", () => {
    const stuck = profileOf({ earn: { pending: [], failures: 3, heldOn: "2026-11-02" } });
    expect(exitIntents(exit({ profile: stuck })).notices).toEqual([]);
    const tomorrow = exitIntents(exit({ profile: stuck, day: "2026-11-03", now: NOW + 86_400 }));
    expect(tomorrow.notices).toHaveLength(2);
  });

  it("makes room for an exit when the places are taken, dropping the oldest request that is not an exit", () => {
    const row = (n: number, box: "payroll" | "operating" | "emergency" | "taxes") => ({ id: `i${n}`, box, vault: EARN, amount: "1", deposit: true, at: NOW - 100 + n });
    const full = profileOf({ earn: { pending: [row(1, "payroll"), row(2, "operating"), row(3, "emergency"), row(4, "taxes")], failures: 0, heldOn: "" } });
    void full;
    const filled = profileOf({ earn: { pending: [row(1, "payroll"), row(2, "operating"), row(3, "emergency"), row(4, "taxes"), { ...row(5, "taxes"), box: "profit", vault: "0x00000000000000000000000000000000000000d9" }], failures: 0, heldOn: "" } });
    const { next } = exitIntents(exit({ profile: filled, shares: { [EARN.toLowerCase()]: { profit: 10n ** 18n } } }));
    expect(next.earn.pending).toHaveLength(5);
    expect(next.earn.pending.some((entry) => entry.box === "profit" && !entry.deposit)).toBe(true);
    expect(next.earn.pending.find((entry) => entry.id === "i1")).toBeUndefined();
  });
});

const abi = parseAbi(["function sharesOf(address vault, uint8 box) view returns (uint256)", "function previewRedeem(uint256 shares) view returns (uint256)"]);

describe("the reads of what an account holds in a vault", () => {
  it("are five share reads on the box vault and one price read on the yield vault", () => {
    const reads = holdingsReads("0x00000000000000000000000000000000000000a1", EARN);
    expect(reads).toHaveLength(6);
    expect(reads.every((read) => read.method === "eth_call")).toBe(true);
  });

  it("decode into shares per box and the price of a share", () => {
    const answers = [10n ** 18n, 0n, 2n * 10n ** 18n, 0n, 0n].map((result) => encodeFunctionResult({ abi, functionName: "sharesOf", result })).concat(encodeFunctionResult({ abi, functionName: "previewRedeem", result: 1_001_058n }));
    expect(decodeHoldings(answers)).toEqual({ shares: { taxes: 10n ** 18n, operating: 2n * 10n ** 18n }, price: 1_001_058n });
  });
});
