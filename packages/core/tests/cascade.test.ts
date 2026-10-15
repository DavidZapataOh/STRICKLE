import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { BOX_KINDS } from "../src/box.ts";
import { type CascadeState, allocatePayment, computeNeeds } from "../src/cascade.ts";
import { money, sum } from "../src/money.ts";

const U = 1_000_000n; // one USDC
const usdc = (units: bigint) => money("USDC", units);

const exampleState: CascadeState = {
  asset: "USDC",
  taxRateBps: 2_000,
  taxBufferBps: 10_500,
  taxLiabilityRemaining: 400n * U,
  payrollDue: 1_200n * U,
  payrollFunded: 300n * U,
  dailySpend: 50n * U,
  operatingBalance: 500n * U,
  floorDays: 14,
  targetDays: 14,
  salaryOwed: 200n * U,
  emergencyTarget: 3_000n * U,
  emergencyBalance: 2_700n * U,
};

const byBox = (state: CascadeState, payment: bigint) => {
  const result = allocatePayment(usdc(payment), state);
  return Object.fromEntries(BOX_KINDS.map((box) => [box, result.byBox[box].units])) as Record<(typeof BOX_KINDS)[number], bigint>;
};

describe("split cascade: the worked example", () => {
  it("splits 2,000 into 400 taxes, 900 payroll, 200 operating, 200 salary, 300 emergency and nothing left", () => {
    const result = allocatePayment(usdc(2_000n * U), exampleState);
    expect(Object.fromEntries(BOX_KINDS.map((box) => [box, result.byBox[box].units]))).toEqual({
      taxes: 400n * U,
      payroll: 900n * U,
      salary: 200n * U,
      operating: 200n * U,
      emergency: 300n * U,
      profit: 0n,
    });
    expect(result.salaryPending.units).toBe(0n);
    expect(result.lines.every((line) => line.met || line.reason === "remainder")).toBe(true);
  });

  it("explains each line with its need and a reason code, in priority order", () => {
    const result = allocatePayment(usdc(2_000n * U), exampleState);
    expect(result.lines.map((line) => line.reason)).toEqual([
      "tax-reserve",
      "payroll-gap",
      "liquidity-floor",
      "salary-owed",
      "liquidity-target",
      "emergency-deficit",
      "remainder",
    ]);
    expect(result.lines[1]?.need.units).toBe(900n * U);
  });
});

describe("split cascade: priorities", () => {
  it("serves taxes first, then payroll, and nothing else when money runs out", () => {
    expect(byBox(exampleState, 500n * U)).toEqual({ taxes: 105n * U, payroll: 395n * U, salary: 0n, operating: 0n, emergency: 0n, profit: 0n });
  });

  it("gives everything to taxes when the payment is below the tax need", () => {
    const heavy = { ...exampleState, taxRateBps: 10_000, taxLiabilityRemaining: undefined };
    expect(byBox(heavy, 150n * U).taxes).toBe(150n * U);
    expect(byBox(heavy, 150n * U).payroll).toBe(0n);
  });

  it("does not pay the salary before the operating floor and reports it as pending", () => {
    const state = { ...exampleState, operatingBalance: 0n };
    const result = allocatePayment(usdc(1_400n * U), state);
    expect(result.byBox.taxes.units).toBe(294n * U);
    expect(result.byBox.payroll.units).toBe(900n * U);
    expect(result.byBox.operating.units).toBe(206n * U);
    expect(result.byBox.salary.units).toBe(0n);
    expect(result.salaryPending.units).toBe(200n * U);
  });

  it("pays part of the salary when only part is affordable after the floor", () => {
    const result = allocatePayment(usdc(1_600n * U + 600n * U), { ...exampleState, operatingBalance: 700n * U, taxRateBps: 0, taxLiabilityRemaining: 0n, payrollFunded: 1_200n * U, salaryOwed: 5_000n * U });
    expect(result.byBox.salary.units).toBe(2_200n * U);
    expect(result.salaryPending.units).toBe(2_800n * U);
  });

  it("fills the operating target before the emergency fund", () => {
    const state = { ...exampleState, targetDays: 42, operatingBalance: 700n * U };
    const result = allocatePayment(usdc(2_000n * U), state);
    expect(result.byBox.operating.units).toBe(500n * U);
    expect(result.byBox.emergency.units).toBe(0n);
  });

  it("sends everything to profit when nothing is owed", () => {
    const calm: CascadeState = { ...exampleState, taxRateBps: 0, taxLiabilityRemaining: undefined, payrollFunded: 1_200n * U, operatingBalance: 10_000n * U, salaryOwed: 0n, emergencyBalance: 3_000n * U };
    expect(byBox(calm, 123_456_789n)).toEqual({ taxes: 0n, payroll: 0n, salary: 0n, operating: 0n, emergency: 0n, profit: 123_456_789n });
  });

  it("scales the payroll gap by the share to fund this round", () => {
    const state = { ...exampleState, payrollShareBps: 5_000 };
    expect(byBox(state, 2_000n * U).payroll).toBe(450n * U);
  });

  it("reserves the buffered tax rate until the liability cap", () => {
    const state: CascadeState = { ...exampleState, taxLiabilityRemaining: undefined };
    expect(computeNeeds(usdc(1_000n * U), state)["tax-reserve"]).toBe(210n * U);
    expect(computeNeeds(usdc(1_000n * U), { ...state, taxLiabilityRemaining: 100n * U })["tax-reserve"]).toBe(100n * U);
    expect(computeNeeds(usdc(3n), { ...state, taxRateBps: 3_333 })["tax-reserve"]).toBe(2n);
  });
});

describe("split cascade: rounding and edges", () => {
  it("never loses or creates a base unit on awkward amounts", () => {
    for (const payment of [0n, 1n, 7n, 999_999n, 1_234_567_891n, 2n ** 63n]) {
      const result = allocatePayment(usdc(payment), { ...exampleState, taxLiabilityRemaining: undefined });
      expect(sum("USDC", BOX_KINDS.map((box) => result.byBox[box])).units).toBe(payment);
    }
  });

  it("handles a zero payment", () => {
    const result = allocatePayment(usdc(0n), exampleState);
    expect(BOX_KINDS.every((box) => result.byBox[box].units === 0n)).toBe(true);
    expect(result.salaryPending.units).toBe(exampleState.salaryOwed);
  });

  it("rejects a payment in another asset", () => {
    expect(() => allocatePayment(money("EURC", 1n), exampleState)).toThrow(/cannot combine/);
  });

  it("rejects invalid states", () => {
    const bad = (patch: Partial<CascadeState>) => () => allocatePayment(usdc(1n), { ...exampleState, ...patch });
    expect(bad({ taxBufferBps: 10_499 })).toThrow(RangeError);
    expect(bad({ taxBufferBps: 11_001 })).toThrow(RangeError);
    expect(bad({ taxRateBps: 10_001 })).toThrow(RangeError);
    expect(bad({ taxRateBps: -1 })).toThrow(RangeError);
    expect(bad({ payrollShareBps: 10_001 })).toThrow(RangeError);
    expect(bad({ payrollDue: -1n })).toThrow(RangeError);
    expect(bad({ dailySpend: -1n })).toThrow(RangeError);
    expect(bad({ floorDays: 10, targetDays: 5 })).toThrow(RangeError);
    expect(() => allocatePayment(usdc(-1n), exampleState)).toThrow(RangeError);
  });
});

const amount = fc.bigInt({ min: 0n, max: 10n ** 13n });
const stateArbitrary: fc.Arbitrary<CascadeState> = fc
  .record({
    taxRateBps: fc.integer({ min: 0, max: 10_000 }),
    taxBufferBps: fc.integer({ min: 10_500, max: 11_000 }),
    taxLiabilityRemaining: fc.option(amount, { nil: undefined }),
    payrollDue: amount,
    payrollFunded: amount,
    payrollShareBps: fc.option(fc.integer({ min: 0, max: 10_000 }), { nil: undefined }),
    dailySpend: fc.bigInt({ min: 0n, max: 10n ** 9n }),
    operatingBalance: amount,
    floorDays: fc.integer({ min: 0, max: 30 }),
    extraDays: fc.integer({ min: 0, max: 60 }),
    salaryOwed: amount,
    emergencyTarget: amount,
    emergencyBalance: amount,
  })
  .map(({ extraDays, floorDays, ...rest }) => ({ asset: "USDC" as const, floorDays, targetDays: floorDays + extraDays, ...rest }));

describe("split cascade: properties", () => {
  const options = { numRuns: 200 };

  it("allocates exactly the payment and never a negative amount", () => {
    fc.assert(
      fc.property(stateArbitrary, amount, (state, payment) => {
        const result = allocatePayment(usdc(payment), state);
        expect(result.lines.reduce((acc, line) => acc + line.amount.units, 0n)).toBe(payment);
        expect(result.lines.every((line) => line.amount.units >= 0n)).toBe(true);
      }),
      options,
    );
  });

  it("never gives a tier more than it needs, except the profit remainder", () => {
    fc.assert(
      fc.property(stateArbitrary, amount, (state, payment) => {
        for (const line of allocatePayment(usdc(payment), state).lines) {
          if (line.reason !== "remainder") expect(line.amount.units).toBeLessThanOrEqual(line.need.units);
        }
      }),
      options,
    );
  });

  it("is a waterfall: a short tier means every later tier gets nothing", () => {
    fc.assert(
      fc.property(stateArbitrary, amount, (state, payment) => {
        const { lines } = allocatePayment(usdc(payment), state);
        const firstShort = lines.findIndex((line) => line.reason !== "remainder" && line.amount.units < line.need.units);
        if (firstShort >= 0) {
          for (const later of lines.slice(firstShort + 1)) expect(later.amount.units).toBe(0n);
        }
      }),
      options,
    );
  });

  it("is monotonic: a bigger payment never reduces any box", () => {
    fc.assert(
      fc.property(stateArbitrary, amount, fc.bigInt({ min: 0n, max: 10n ** 12n }), (state, payment, extra) => {
        const small = allocatePayment(usdc(payment), state).byBox;
        const large = allocatePayment(usdc(payment + extra), state).byBox;
        for (const box of BOX_KINDS) expect(large[box].units).toBeGreaterThanOrEqual(small[box].units);
      }),
      options,
    );
  });

  it("agrees between its lines, its totals and the pending salary", () => {
    fc.assert(
      fc.property(stateArbitrary, amount, (state, payment) => {
        const result = allocatePayment(usdc(payment), state);
        for (const box of BOX_KINDS) {
          const fromLines = result.lines.filter((line) => line.box === box).reduce((acc, line) => acc + line.amount.units, 0n);
          expect(result.byBox[box].units).toBe(fromLines);
        }
        expect(result.salaryPending.units).toBe(state.salaryOwed - result.byBox.salary.units);
        expect(allocatePayment(usdc(payment), state)).toEqual(result);
      }),
      options,
    );
  });
});
