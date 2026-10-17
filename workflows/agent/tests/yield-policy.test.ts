import { plainDate } from "@strickle/core";
import { describe, expect, it } from "vitest";
import { applyAction } from "../enclave/actions.ts";
import { actionSchema } from "../enclave/signed.ts";
import { type PolicyInput, obligationsOf, yieldIntents } from "../enclave/yield-policy.ts";
import { profileOf } from "./support.ts";

const M = 1_000_000n;
const EARN = "0xAabbeF1D3971c710276ed41eC791BbE14CdB8E88";
const today = plainDate(2026, 11, 2); // a Monday
const NOW = 1_794_000_000;
const zero = { taxes: 0n, payroll: 0n, salary: 0n, operating: 0n, emergency: 0n, profit: 0n };
const allowing = (over: Record<string, { maxInvestBps: number; floor: bigint }> = {}) => ({ taxes: { maxInvestBps: 5_000, floor: 0n }, payroll: { maxInvestBps: 0, floor: 0n }, operating: { maxInvestBps: 0, floor: 0n }, emergency: { maxInvestBps: 10_000, floor: 0n }, profit: { maxInvestBps: 10_000, floor: 0n }, ...over });
const enabled = (over: Record<string, unknown> = {}) => profileOf({ yield: { enabled: true, day: "", realized: "0", fee: "0", invitedOn: "" }, ...over });
const input = (over: Partial<PolicyInput> = {}): PolicyInput => ({
  profile: enabled(),
  usdc: { ...zero, profit: 10_000n * M, taxes: 2_000n * M },
  invested: { ...zero },
  rules: allowing(),
  holdings: { [EARN.toLowerCase()]: { profit: 0n } },
  views: [{ id: EARN.toLowerCase(), protocol: "morpho", apyBps: 420, active: true, liquidity: 1_000_000n * M }],
  vaults: [{ address: EARN, name: "EarnKit USDC Vault", protocol: "Morpho" }],
  today,
  now: NOW,
  ...over,
});
const y = (policy: PolicyInput) => yieldIntents(policy).next;
const summary = (profile: ReturnType<typeof y>) => profile.earn.pending.map((entry) => [entry.box, entry.deposit, entry.amount, entry.auto]);

describe("obligationsOf", () => {
  it("lists the payrolls and the next tax date with what is owed", () => {
    const profile = profileOf({ payrolls: [["2026-11-20", "3000000000"], ["2026-12-20", "3000000000"]], taxDates: ["2026-10-01", "2026-12-15", "2027-03-15"], taxesDue: "900000000" });
    expect(obligationsOf(profile, today)).toEqual([
      { box: "payroll", due: plainDate(2026, 11, 20), amount: 3_000n * M },
      { box: "payroll", due: plainDate(2026, 12, 20), amount: 3_000n * M },
      { box: "taxes", due: plainDate(2026, 12, 15), amount: 900n * M },
    ]);
  });

  it("is empty for a profile with nothing due", () => {
    expect(obligationsOf(profileOf(), today)).toEqual([]);
  });

  it("keeps a payroll due today and ignores a payroll that is already past", () => {
    const profile = profileOf({ payrolls: [["2026-11-02", "1"], ["2026-11-01", "2"]] });
    expect(obligationsOf(profile, today)).toEqual([{ box: "payroll", due: today, amount: 1n }]);
  });
});

describe("yieldIntents", () => {
  it("puts to work what a box does not need, spread by the allocation, when yield is on", () => {
    const profile = y(input());
    expect(summary(profile)).toEqual([
      ["taxes", true, String(1_000n * M), true],
      ["profit", true, String(10_000n * M), true],
    ]);
    expect(profile.yield.day).toBe("2026-11-02");
  });

  it("keeps what is due within sixty days liquid", () => {
    const profile = y(input({ profile: enabled({ taxDates: ["2026-12-15"], taxesDue: "1500000000" }) }));
    expect(summary(profile)).toEqual([
      ["taxes", true, String(500n * M), true],
      ["profit", true, String(10_000n * M), true],
    ]);
  });

  it("invests nothing when yield is off, and only once a day when it is on", () => {
    expect(y(input({ profile: profileOf() })).earn.pending).toEqual([]);
    expect(y(input({ profile: enabled({ yield: { enabled: true, day: "2026-11-02", realized: "0", fee: "0", invitedOn: "" } }) })).earn.pending).toEqual([]);
  });

  it("never invests the salary box, and never invests while halted or when a request waits for that box", () => {
    expect(y(input({ usdc: { ...zero, salary: 9_000n * M } })).earn.pending).toEqual([]);
    const halted = enabled({ breaker: { halted: true, since: "2026-11-01", codes: ["user-pause"] } });
    expect(y(input({ profile: halted })).earn.pending).toEqual([]);
    const waiting = enabled({ earn: { pending: [{ id: "i1", box: "profit", vault: EARN, amount: "1", deposit: false, at: NOW - 5 }], failures: 0, heldOn: "" } });
    expect(summary(y(input({ profile: waiting }))).some(([box, deposit]) => box === "profit" && deposit === true)).toBe(false);
  });

  it("skips dust and a vault that is flagged or closed", () => {
    expect(y(input({ usdc: { ...zero, profit: 5n * M } })).earn.pending).toEqual([]);
    expect(y(input({ views: [{ id: EARN.toLowerCase(), protocol: "morpho", apyBps: 420, active: false, liquidity: 1_000_000n * M }] })).earn.pending).toEqual([]);
  });

  it("brings money back for a payment inside the lead window even when yield is off, and never twice", () => {
    const profile = profileOf({ payrolls: [["2026-11-04", "3000000000"]] });
    const first = y(input({ profile, usdc: { ...zero, payroll: 500n * M }, invested: { ...zero, payroll: 5_000n * M }, holdings: { [EARN.toLowerCase()]: { payroll: 5_000n * M } } }));
    expect(summary(first)).toEqual([["payroll", false, String(2_525n * M), true]]);
    const again = y(input({ profile: first, usdc: { ...zero, payroll: 500n * M }, invested: { ...zero, payroll: 5_000n * M }, holdings: { [EARN.toLowerCase()]: { payroll: 5_000n * M } } }));
    expect(again.earn.pending).toHaveLength(1);
  });

  it("asks for a redemption even while a payment is the only thing waiting, and only from the vault that holds the money", () => {
    const profile = profileOf({ payrolls: [["2026-11-04", "1000000000"]] });
    const other = "0x8f2d33b5d4b9b5f02df635ae308f7b4c9da8d2dc";
    const result = y(
      input({ profile, usdc: { ...zero, payroll: 0n }, invested: { ...zero, payroll: 2_000n * M }, holdings: { [EARN.toLowerCase()]: { payroll: 0n }, [other]: { payroll: 2_000n * M } }, vaults: [{ address: EARN, name: "A", protocol: "Morpho" }, { address: other, name: "B", protocol: "Morpho" }] }),
    );
    expect(result.earn.pending.map((entry) => entry.vault.toLowerCase())).toEqual([other]);
  });
});

describe("what the agent says about its decisions", () => {
  it("explains what it put to work, what it kept and why", () => {
    const { notices } = yieldIntents(input({ profile: enabled({ taxDates: ["2026-12-15"], taxesDue: "1500000000" }) }));
    expect(notices).toEqual([
      { kind: "yield-plan", box: "taxes", amount: String(500n * M), kept: String(1_500n * M), needed: String(1_500n * M) },
      { kind: "yield-plan", box: "profit", amount: String(10_000n * M), kept: "0", needed: "0" },
    ]);
  });

  it("explains a redemption with the payment and its date", () => {
    const profile = profileOf({ payrolls: [["2026-11-04", "3000000000"]] });
    const { notices } = yieldIntents(input({ profile, usdc: { ...zero, payroll: 500n * M }, invested: { ...zero, payroll: 5_000n * M }, holdings: { [EARN.toLowerCase()]: { payroll: 5_000n * M } } }));
    expect(notices).toEqual([{ kind: "yield-back", box: "payroll", amount: String(2_525n * M), payment: String(3_000n * M), due: "2026-11-04" }]);
  });

  it("says nothing when it decided nothing", () => {
    expect(yieldIntents(input({ profile: profileOf() })).notices).toEqual([]);
  });
});

describe("the signed switch", () => {
  it("parses a yield setting and applies it without touching anything else", () => {
    expect(actionSchema.safeParse({ kind: "adjust", changes: { yieldEnabled: true } }).success).toBe(true);
    const books = { boxes: zero, invested: zero, unallocated: 0n };
    const result = applyAction(profileOf(), { kind: "adjust", changes: { yieldEnabled: true } }, { now: NOW, today, books });
    if (!result.ok) throw new Error(result.reason);
    expect(result.next.yield.enabled).toBe(true);
    const off = applyAction(result.next, { kind: "adjust", changes: { yieldEnabled: false } }, { now: NOW, today, books });
    if (!off.ok) throw new Error(off.reason);
    expect(off.next.yield.enabled).toBe(false);
    expect(off.next.salary).toEqual(profileOf().salary);
  });

  it("leaves the yield state alone for a setting that changes nothing", () => {
    const books = { boxes: zero, invested: zero, unallocated: 0n };
    const profile = profileOf({ yield: { enabled: true, day: "2026-11-01", realized: "0", fee: "0", invitedOn: "" } });
    const result = applyAction(profile, { kind: "adjust", changes: { yieldEnabled: true } }, { now: NOW, today, books });
    if (!result.ok) throw new Error(result.reason);
    expect(result.next.yield).toMatchObject({ enabled: true, day: "2026-11-01" });
  });
});
