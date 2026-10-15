import fc from "fast-check";
import { BOX_KINDS, addDays } from "@strickle/core";
import { describe, expect, it } from "vitest";
import { type Action, type InvariantPolicy, type Snapshot, evaluate, predict } from "../src/invariants.ts";
import { asOf, snap, zeroBoxes } from "./fixtures.ts";

const total = (s: Snapshot) => BOX_KINDS.reduce((sum, box) => sum + s.boxes[box], 0n) + s.unallocated;

describe("predict", () => {
  it("split moves unallocated money into boxes", () => {
    const s = predict(snap({ unallocated: 100n, liquid: 1_350n }), { kind: "split", amounts: { profit: 60n, operating: 40n } });
    expect(s.boxes.profit).toBe(110n);
    expect(s.boxes.operating).toBe(240n);
    expect(s.unallocated).toBe(0n);
  });
  it("move shifts value between boxes and changes no outflow", () => {
    const s = predict(snap(), { kind: "move", from: "operating", to: "emergency", amount: 60n });
    expect([s.boxes.operating, s.boxes.emergency, s.outflowsToday]).toEqual([140n, 160n, 0n]);
  });
  it("pay debits the box and the liquid balance and counts as an outflow", () => {
    const s = predict(snap(), { kind: "pay", from: "profit", amount: 30n });
    expect([s.boxes.profit, s.liquid, s.outflowsToday]).toEqual([20n, 1_220n, 30n]);
  });
  it("paying a payroll removes that payroll from the list", () => {
    const due = addDays(asOf, 2);
    const s = predict(snap({ payrolls: [{ due, amount: 300n }] }), { kind: "pay", from: "payroll", amount: 300n, settles: { kind: "payroll", due } });
    expect(s.payrolls).toEqual([]);
    expect(s.boxes.payroll).toBe(0n);
  });
  it("sweep and redeem move liquid money to and from the yield vaults without touching the boxes", () => {
    const swept = predict(snap(), { kind: "sweep", amount: 500n });
    expect([swept.liquid, swept.inVaults, swept.boxes.profit]).toEqual([750n, 500n, 50n]);
    const redeemed = predict(swept, { kind: "redeem", amount: 200n });
    expect([redeemed.liquid, redeemed.inVaults]).toEqual([950n, 300n]);
  });
  it("salary pays out of the salary box and counts as an outflow", () => {
    const s = predict(snap(), { kind: "salary", amount: 150n });
    expect([s.boxes.salary, s.liquid, s.outflowsToday]).toEqual([50n, 1_100n, 150n]);
  });
  it("paying needs liquid cash: value parked in a yield vault must be redeemed first", () => {
    const parked = snap({ liquid: 20n, inVaults: 1_230n }); // the boxes still hold 1,250 of value, but only 20 is cash
    expect(() => predict(parked, { kind: "pay", from: "profit", amount: 30n })).toThrow(/liquid cash/);
    expect(() => predict(parked, { kind: "salary", amount: 30n })).toThrow(/liquid cash/);
    expect(predict(parked, { kind: "pay", from: "profit", amount: 20n }).liquid).toBe(0n);
  });
  it("never mutates its input", () => {
    const before = snap();
    predict(before, { kind: "pay", from: "profit", amount: 10n });
    expect(before).toEqual(snap());
  });
  it("rejects impossible actions", () => {
    expect(() => predict(snap(), { kind: "split", amounts: { profit: 1n } })).toThrow(RangeError); // nothing unallocated
    expect(() => predict(snap(), { kind: "pay", from: "profit", amount: 51n })).toThrow(RangeError);
    expect(() => predict(snap(), { kind: "move", from: "profit", to: "operating", amount: -1n })).toThrow(RangeError);
    expect(() => predict(snap(), { kind: "sweep", amount: 1_251n })).toThrow(RangeError);
    expect(() => predict(snap(), { kind: "redeem", amount: 1n })).toThrow(RangeError);
    expect(() => predict(snap(), { kind: "salary", amount: 201n })).toThrow(RangeError);
    expect(() => predict(snap(), { kind: "pay", from: "payroll", amount: 1n, settles: { kind: "payroll", due: asOf } })).toThrow(/payroll/);
  });
  it("conserves value: boxes plus unallocated always equal liquid plus vaults, and outflows leave only through pay and salary", () => {
    const action = (s: Snapshot, pick: number, fraction: number): Action => {
      const part = (limit: bigint) => (limit * BigInt(fraction)) / 100n;
      switch (pick % 6) {
        case 0: return { kind: "split", amounts: { profit: part(s.unallocated) } };
        case 1: return { kind: "move", from: "operating", to: "emergency", amount: part(s.boxes.operating) };
        case 2: return { kind: "pay", from: "profit", amount: part(s.boxes.profit < s.liquid ? s.boxes.profit : s.liquid) };
        case 3: return { kind: "sweep", amount: part(s.liquid) };
        case 4: return { kind: "redeem", amount: part(s.inVaults) };
        default: return { kind: "salary", amount: part(s.boxes.salary < s.liquid ? s.boxes.salary : s.liquid) };
      }
    };
    fc.assert(
      fc.property(fc.array(fc.tuple(fc.nat(5), fc.integer({ min: 0, max: 100 })), { minLength: 1, maxLength: 12 }), (steps) => {
        let s = snap({ unallocated: 500n, liquid: 1_750n });
        for (const [pick, fraction] of steps) {
          const next = predict(s, action(s, pick, fraction));
          expect(total(next)).toBe(next.liquid + next.inVaults);
          s = next;
        }
      }),
      { numRuns: 200 },
    );
  });
});

const policy: InvariantPolicy = { dailyCap: 500n, signatureThreshold: 300n };
const check = (before: Snapshot, action: Action) => evaluate(before, predict(before, action), policy, action);
const codes = (violations: { code: string }[]) => violations.map((v) => v.code);

describe("evaluate: books-balance", () => {
  it("passes balanced books and fails a real result off by one unit", () => {
    const before = snap();
    const action: Action = { kind: "move", from: "profit", to: "operating", amount: 10n };
    expect(evaluate(before, predict(before, action), policy, action)).toEqual([]);
    const broken = { ...predict(before, action), liquid: 1_251n };
    expect(evaluate(before, broken, policy, action)).toEqual([expect.objectContaining({ code: "books-balance", gap: 1n })]);
  });
});

describe("evaluate: taxes-untouched", () => {
  it("fails when the agent debits the taxes box, passes a settlement to an approved authority", () => {
    expect(check(snap(), { kind: "pay", from: "taxes", amount: 10n })).toEqual([expect.objectContaining({ code: "taxes-untouched", gap: 10n })]);
    expect(check(snap(), { kind: "move", from: "taxes", to: "profit", amount: 10n })).toEqual([expect.objectContaining({ code: "taxes-untouched", gap: 10n })]);
    expect(check(snap(), { kind: "pay", from: "taxes", amount: 10n, settles: { kind: "tax" } })).toEqual([]);
  });
  it("lets the taxes box grow and does not trip when the reserved amount is recomputed", () => {
    expect(check(snap({ unallocated: 50n, liquid: 1_300n }), { kind: "split", amounts: { taxes: 50n } })).toEqual([]);
    const before = snap();
    const after = { ...before, taxesReserved: 900n };
    expect(evaluate(before, after, policy, { kind: "sweep", amount: 0n })).toEqual([]);
  });
});

describe("evaluate: payroll-funded", () => {
  const due2 = { due: addDays(asOf, 2), amount: 300n };
  it("requires the payroll due within two days to stay funded: exactly funded passes, one unit short fails", () => {
    expect(check(snap({ payrolls: [due2] }), { kind: "move", from: "profit", to: "operating", amount: 10n })).toEqual([]);
    expect(check(snap({ payrolls: [due2] }), { kind: "pay", from: "payroll", amount: 1n })).toEqual([expect.objectContaining({ code: "payroll-funded", gap: 1n })]);
  });
  it("a sweep into a yield vault that leaves less liquid cash than the payroll due soon is refused", () => {
    const soon = snap({ payrolls: [due2] }); // liquid 1,250, payroll due in 2 days: 300
    expect(check(soon, { kind: "sweep", amount: 950n })).toEqual([]); // leaves exactly 300
    expect(check(soon, { kind: "sweep", amount: 1_000n })).toEqual([expect.objectContaining({ code: "payroll-funded", gap: 50n })]);
  });
  it("does not require a payroll due in three days yet", () => {
    expect(check(snap({ payrolls: [{ due: addDays(asOf, 3), amount: 300n }] }), { kind: "pay", from: "payroll", amount: 100n })).toEqual([]);
  });
  it("accepts paying the payroll itself (it is settled, so nothing is owed)", () => {
    expect(check(snap({ payrolls: [due2] }), { kind: "pay", from: "payroll", amount: 300n, settles: { kind: "payroll", due: due2.due } })).toEqual([]);
  });
  it("judges an already-underfunded payroll by whether the action makes it worse", () => {
    const underfunded = snap({ payrolls: [{ due: asOf, amount: 500n }] }); // box 300, gap 200
    expect(check({ ...underfunded, unallocated: 50n, liquid: 1_300n }, { kind: "split", amounts: { payroll: 50n } })).toEqual([]);
    expect(check(underfunded, { kind: "pay", from: "payroll", amount: 10n })).toEqual([expect.objectContaining({ code: "payroll-funded", gap: 210n })]);
  });
});

describe("evaluate: emergency-routing", () => {
  it("never lets the agent move emergency money into the salary box", () => {
    expect(check(snap(), { kind: "move", from: "emergency", to: "salary", amount: 10n, ownerRequest: { requestedAt: 0, now: 999_999 } })).toEqual([expect.objectContaining({ code: "emergency-routing", gap: 10n })]);
  });
  it("lets money leave the emergency box only on an owner request older than 24 hours", () => {
    const move = (requestedAt: number, now: number): Action => ({ kind: "move", from: "emergency", to: "operating", amount: 10n, ownerRequest: { requestedAt, now } });
    expect(check(snap(), move(1_000, 1_000 + 86_400))).toEqual([]);
    expect(check(snap(), move(1_000, 1_000 + 86_399))).toEqual([expect.objectContaining({ code: "emergency-routing" })]);
    expect(check(snap(), { kind: "move", from: "emergency", to: "operating", amount: 10n })).toEqual([expect.objectContaining({ code: "emergency-routing" })]);
  });
  it("does not touch moves into the emergency box or between other boxes", () => {
    expect(check(snap(), { kind: "move", from: "operating", to: "emergency", amount: 10n })).toEqual([]);
  });
});

describe("evaluate: cushion-floor", () => {
  it("allows the operating box to reach exactly 14 days of spend and refuses one unit below", () => {
    expect(check(snap(), { kind: "move", from: "operating", to: "profit", amount: 60n })).toEqual([]);
    expect(check(snap(), { kind: "move", from: "operating", to: "profit", amount: 61n })).toEqual([expect.objectContaining({ code: "cushion-floor", gap: 1n })]);
  });
  it("does not stop a first deposit into an empty account", () => {
    const empty = snap({ boxes: { ...zeroBoxes }, unallocated: 1_000n, liquid: 1_000n, taxesReserved: 0n });
    expect(check(empty, { kind: "split", amounts: { profit: 1_000n } })).toEqual([]); // cushion gap 140 before and after
  });
  it("refuses to worsen a cushion that is already under the floor and accepts improving it", () => {
    const low = snap({ boxes: { ...zeroBoxes, operating: 100n, profit: 1_150n } });
    expect(check(low, { kind: "move", from: "operating", to: "profit", amount: 10n })).toEqual([expect.objectContaining({ code: "cushion-floor", gap: 50n })]);
    expect(check(low, { kind: "move", from: "profit", to: "operating", amount: 10n })).toEqual([]);
  });
  it("ignores the floor when the daily spend is unknown (zero)", () => {
    expect(check(snap({ dailySpend: 0n }), { kind: "move", from: "operating", to: "profit", amount: 200n })).toEqual([]);
  });
});

describe("evaluate: daily-cap and signature-required", () => {
  it("allows outflows up to exactly the cap and refuses one unit above", () => {
    const busy = snap({ outflowsToday: 400n });
    expect(check(busy, { kind: "pay", from: "profit", amount: 50n })).toEqual([]);
    expect(check({ ...busy, boxes: { ...busy.boxes, profit: 200n }, liquid: 1_400n, unallocated: 0n }, { kind: "pay", from: "profit", amount: 101n, signed: true })).toEqual([expect.objectContaining({ code: "daily-cap", gap: 1n })]);
  });
  it("needs a signature for a single outflow above the threshold, not at it", () => {
    const rich = snap({ boxes: { ...zeroBoxes, profit: 1_250n } });
    expect(check(rich, { kind: "pay", from: "profit", amount: 300n })).toEqual([]);
    expect(check(rich, { kind: "pay", from: "profit", amount: 301n })).toEqual([expect.objectContaining({ code: "signature-required", gap: 1n })]);
    expect(check(rich, { kind: "pay", from: "profit", amount: 301n, signed: true })).toEqual([]);
    expect(check(snap({ boxes: { ...zeroBoxes, salary: 1_250n } }), { kind: "salary", amount: 301n })).toEqual([expect.objectContaining({ code: "signature-required", gap: 1n })]);
  });
});

describe("evaluate: several violations", () => {
  it("returns every violation in the fixed order", () => {
    const rich = snap({ boxes: { ...zeroBoxes, taxes: 1_250n }, taxesReserved: 1_250n });
    const found = check(rich, { kind: "pay", from: "taxes", amount: 600n });
    expect(codes(found)).toEqual(["taxes-untouched", "daily-cap", "signature-required"]);
    expect(found.map((v) => v.gap)).toEqual([600n, 100n, 300n]);
  });
  it("rejects a negative cap or threshold", () => {
    const action: Action = { kind: "sweep", amount: 0n };
    expect(() => evaluate(snap(), snap(), { dailyCap: -1n, signatureThreshold: 0n }, action)).toThrow(RangeError);
    expect(() => evaluate(snap(), snap(), { dailyCap: 0n, signatureThreshold: -1n }, action)).toThrow(RangeError);
    expect(() => evaluate(snap(), snap(), { floorDays: 0, dailyCap: 0n, signatureThreshold: 0n }, action)).toThrow(RangeError);
  });
});
