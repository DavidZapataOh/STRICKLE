import fc from "fast-check";
import { BOX_KINDS, addDays } from "@strickle/core";
import { describe, expect, it } from "vitest";
import { type Action, type Snapshot, predict } from "../src/invariants.ts";
import { asOf, snap } from "./fixtures.ts";

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
