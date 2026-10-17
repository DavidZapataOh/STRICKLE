// workflows/agent/tests/earn-state.test.ts
import { plainDate } from "@strickle/core";
import { describe, expect, it } from "vitest";
import { applyAction } from "../enclave/actions.ts";
import { decodeProfile, encodeProfile, mergeProfile } from "../enclave/profile.ts";
import { actionSchema } from "../enclave/signed.ts";
import { profileOf } from "./support.ts";

const vaultA = "0xAabbeF1D3971c710276ed41eC791BbE14CdB8E88";
const vaultB = "0x8f2d33b5d4b9b5f02df635ae308f7b4c9da8d2dc";
const stranger = "0x00000000000000000000000000000000000000f1";
const NOW = Date.UTC(2026, 10, 1, 0, 5) / 1000;
const today = plainDate(2026, 11, 1);
const zero = { taxes: 0n, payroll: 0n, salary: 0n, operating: 0n, emergency: 0n, profit: 0n };
const books = { boxes: zero, invested: zero, unallocated: 0n };
const run = (action: Parameters<typeof applyAction>[1], profile = profileOf(), earnVaults: string[] = [vaultA, vaultB]) => applyAction(profile, action, { now: NOW, today, books, earnVaults });
const invest = (over: Record<string, unknown> = {}) => ({ kind: "invest" as const, box: "profit" as const, vault: vaultA, amount: "500000000", ...over });

describe("the earn bookkeeping in the profile", () => {
  it("starts empty and survives an encode and a decode", () => {
    const profile = profileOf();
    expect(profile.earn).toEqual({ pending: [], failures: 0, heldOn: "" });
    expect(decodeProfile(encodeProfile(profile)).earn).toEqual(profile.earn);
  });

  it("is the agent's: a submitted profile cannot seed or overwrite it", () => {
    const stored = profileOf({ earn: { pending: [{ id: "i1", box: "profit", vault: vaultA, amount: "1", deposit: true, at: NOW }], failures: 2, heldOn: "2026-11-01" } });
    expect(mergeProfile(stored, profileOf()).earn).toEqual(stored.earn);
    const seeded = profileOf({ earn: { pending: [{ id: "x", box: "profit", vault: vaultA, amount: "1", deposit: true, at: NOW }], failures: 3, heldOn: "" } });
    expect(mergeProfile(undefined, seeded).earn).toEqual({ pending: [], failures: 0, heldOn: "" });
  });

  it("holds at most four intents and refuses malformed ones", () => {
    const row = (n: number) => ({ id: `i${n}`, box: "profit", vault: vaultA, amount: "1", deposit: true, at: NOW });
    expect(() => profileOf({ earn: { pending: [1, 2, 3, 4, 5].map(row), failures: 0, heldOn: "" } })).toThrow();
    expect(() => profileOf({ earn: { pending: [{ ...row(1), amount: "-1" }], failures: 0, heldOn: "" } })).toThrow();
    expect(() => profileOf({ earn: { pending: [], failures: 10, heldOn: "" } })).toThrow();
  });
});

describe("the signed invest and divest actions", () => {
  it("parse for any box, a vault address and a positive amount", () => {
    expect(actionSchema.safeParse(invest()).success).toBe(true);
    expect(actionSchema.safeParse({ ...invest(), kind: "divest" }).success).toBe(true);
  });

  it("refuse a zero amount, a malformed vault, an unknown box and extra fields", () => {
    for (const bad of [{ amount: "0" }, { amount: "-5" }, { vault: "0x12" }, { box: "savings" }, { extra: 1 }]) {
      expect(actionSchema.safeParse(invest(bad)).success).toBe(false);
    }
  });
});

describe("applying an invest or a divest", () => {
  it("records the intent, resets the breaker and says nothing yet", () => {
    const result = run(invest(), profileOf({ earn: { pending: [], failures: 2, heldOn: "2026-10-31" } }));
    if (!result.ok) throw new Error(result.reason);
    expect(result.notices).toEqual([]);
    expect(result.next.earn.failures).toBe(0);
    expect(result.next.earn.pending).toEqual([{ id: expect.any(String), box: "profit", vault: vaultA, amount: "500000000", deposit: true, at: NOW }]);
  });

  it("records a divest as a withdrawal", () => {
    const result = run({ ...invest(), kind: "divest" });
    if (!result.ok) throw new Error(result.reason);
    expect(result.next.earn.pending[0]?.deposit).toBe(false);
  });

  it("matches a vault of the configuration whatever the letter case", () => {
    expect(run(invest({ vault: vaultA.toLowerCase() })).ok).toBe(true);
  });

  it("refuses a vault the configuration does not list", () => {
    expect(run(invest({ vault: stranger }))).toEqual({ ok: false, reason: "unknown-vault" });
  });

  it("refuses an amount beyond what a person could hold", () => {
    expect(run(invest({ amount: String(10n ** 16n) }))).toEqual({ ok: false, reason: "amount-too-large" });
  });

  it("keeps only the newest intent for the same box, vault and direction", () => {
    const first = run(invest({ amount: "100" }));
    if (!first.ok) throw new Error(first.reason);
    const second = run(invest({ amount: "200" }), first.next);
    if (!second.ok) throw new Error(second.reason);
    expect(second.next.earn.pending.map((entry) => entry.amount)).toEqual(["200"]);
  });

  it("refuses a fifth different intent", () => {
    let profile = profileOf();
    for (const box of ["profit", "taxes", "emergency", "operating"] as const) {
      const result = run(invest({ box }), profile);
      if (!result.ok) throw new Error(result.reason);
      profile = result.next;
    }
    expect(run(invest({ box: "payroll" }), profile)).toEqual({ ok: false, reason: "too-many-pending" });
  });

  it("refuses while the agent is halted, because nothing moves then", () => {
    const halted = profileOf({ breaker: { halted: true, since: "2026-11-01", codes: ["user-pause"] } });
    expect(run(invest(), halted)).toEqual({ ok: false, reason: "halted" });
  });

  it("refuses the salary box, which is paid every month and must stay liquid", () => {
    expect(actionSchema.safeParse(invest({ box: "salary" })).success).toBe(false);
  });
});
