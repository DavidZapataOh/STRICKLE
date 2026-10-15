import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { type ActionKind, type AutonomyPolicy, type AutonomyRecord, actionClass, decideAutonomy } from "../src/autonomy.ts";
import type { BreakerState } from "../src/breaker.ts";

const running: BreakerState = { status: "running" };
const halted: BreakerState = { status: "halted", since: { year: 2026, month: 10, day: 15 }, violations: [] };
const policy: AutonomyPolicy = { capStep: 100n, signatureThreshold: 1_000n };
const record = (over: Partial<AutonomyRecord> = {}): AutonomyRecord => ({ cleanTaxDueDates: 0, paymentCap: 500n, paymentCapStart: 500n, paymentCapCeiling: 2_000n, cleanMonths: 0, ...over });
const decide = (kind: ActionKind, extra: object = {}, rec = record(), breaker: BreakerState = running) => decideAutonomy({ kind, ...extra }, rec, breaker, policy);

describe("decideAutonomy: the static table", () => {
  it.each(["split", "vault-sweep", "vault-redeem", "salary-day-one"] as const)("%s is automatic", (kind) => {
    expect(decide(kind)).toEqual({ mode: "auto" });
  });
  it.each(["salary-raise", "structural-change"] as const)("%s is always a proposal", (kind) => {
    expect(decide(kind)).toEqual({ mode: "propose", reason: "always-proposed" });
    expect(decide(kind, {}, record({ cleanTaxDueDates: 99, paymentCap: 2_000n, cleanMonths: 99 }))).toEqual({ mode: "propose", reason: "always-proposed" });
  });
  it("recomputing taxes is automatic and notifies above a 200 bps change in either direction", () => {
    expect(decide("taxes-recompute", { rateChangeBps: 200 })).toEqual({ mode: "auto" });
    expect(decide("taxes-recompute", { rateChangeBps: -200 })).toEqual({ mode: "auto" });
    expect(decide("taxes-recompute", { rateChangeBps: 201 })).toEqual({ mode: "auto", notify: true });
    expect(decide("taxes-recompute", { rateChangeBps: -201 })).toEqual({ mode: "auto", notify: true });
    expect(decide("taxes-recompute")).toEqual({ mode: "auto" });
  });
});

describe("decideAutonomy: taxes to local currency is earned", () => {
  it.each([[0, "propose"], [1, "propose"], [2, "auto"], [3, "auto"]] as const)("with %i clean due dates it is %s", (clean, mode) => {
    expect(decide("taxes-to-local", {}, record({ cleanTaxDueDates: clean })).mode).toBe(mode);
  });
  it("explains why it still proposes", () => {
    expect(decide("taxes-to-local", {}, record({ cleanTaxDueDates: 1 }))).toEqual({ mode: "propose", reason: "not-yet-earned" });
  });
  it("honours a custom number of due dates", () => {
    expect(decideAutonomy({ kind: "taxes-to-local" }, record({ cleanTaxDueDates: 2 }), running, { capStep: 1n, taxesToLocalAfter: 3 }).mode).toBe("propose");
  });
});

describe("decideAutonomy: payments", () => {
  it("is automatic to an allowlisted recipient up to exactly the cap, a proposal one unit above", () => {
    expect(decide("payment", { amount: 500n, recipientAllowlisted: true })).toEqual({ mode: "auto" });
    expect(decide("payment", { amount: 501n, recipientAllowlisted: true })).toEqual({ mode: "propose", reason: "above-cap" });
  });
  it("is never automatic to a recipient that is not allowlisted, whatever the amount", () => {
    expect(decide("payment", { amount: 1n, recipientAllowlisted: false })).toEqual({ mode: "propose", reason: "recipient-not-allowlisted" });
    expect(decide("payment", { amount: 1n })).toEqual({ mode: "propose", reason: "recipient-not-allowlisted" });
  });
  it("proposes instead when the amount needs a human signature, even within the cap", () => {
    const low: AutonomyPolicy = { capStep: 100n, signatureThreshold: 300n };
    expect(decideAutonomy({ kind: "payment", amount: 300n, recipientAllowlisted: true }, record(), running, low)).toEqual({ mode: "auto" });
    expect(decideAutonomy({ kind: "payment", amount: 301n, recipientAllowlisted: true }, record(), running, low)).toEqual({ mode: "propose", reason: "needs-signature" });
  });
  it("the day-one salary is automatic up to the signature threshold and a proposal above it", () => {
    const low: AutonomyPolicy = { capStep: 100n, signatureThreshold: 300n };
    expect(decideAutonomy({ kind: "salary-day-one", amount: 300n }, record(), running, low)).toEqual({ mode: "auto" });
    expect(decideAutonomy({ kind: "salary-day-one", amount: 301n }, record(), running, low)).toEqual({ mode: "propose", reason: "needs-signature" });
    expect(decideAutonomy({ kind: "salary-day-one", amount: 301n }, record(), running, { capStep: 1n })).toEqual({ mode: "auto" });
  });
  it("needs an amount", () => {
    expect(() => decide("payment", { recipientAllowlisted: true })).toThrow(RangeError);
    expect(() => decide("payment", { amount: -1n, recipientAllowlisted: true })).toThrow(RangeError);
  });
});

describe("decideAutonomy: a halted breaker blocks everything", () => {
  it.each(["split", "taxes-recompute", "vault-sweep", "vault-redeem", "salary-day-one", "taxes-to-local", "salary-raise", "structural-change"] as const)("%s", (kind) => {
    expect(decide(kind, {}, record(), halted)).toEqual({ mode: "blocked", reason: "halted" });
  });
  it("payment too", () => {
    expect(decide("payment", { amount: 1n, recipientAllowlisted: true }, record(), halted)).toEqual({ mode: "blocked", reason: "halted" });
  });
});

describe("decideAutonomy: properties", () => {
  const records = fc.record({
    cleanTaxDueDates: fc.nat(10),
    paymentCap: fc.bigInt({ min: 0n, max: 5_000n }),
    paymentCapStart: fc.bigInt({ min: 0n, max: 5_000n }),
    paymentCapCeiling: fc.bigInt({ min: 0n, max: 5_000n }),
    cleanMonths: fc.nat(30),
  });
  it("a raise or a structural change is never automatic, for any record", () => {
    fc.assert(fc.property(records, fc.constantFrom("salary-raise", "structural-change"), (rec, kind) => {
      expect(decideAutonomy({ kind }, rec, running, policy).mode).toBe("propose");
    }), { numRuns: 200 });
  });
  it("a payment is automatic exactly when the recipient is allowlisted and the amount is within the cap and the signature threshold", () => {
    fc.assert(fc.property(records, fc.bigInt({ min: 0n, max: 6_000n }), fc.boolean(), (rec, amount, allowlisted) => {
      const d = decideAutonomy({ kind: "payment", amount, recipientAllowlisted: allowlisted }, rec, running, policy);
      expect(d.mode === "auto").toBe(allowlisted && amount <= rec.paymentCap && amount <= 1_000n);
    }), { numRuns: 200 });
  });
});

describe("actionClass", () => {
  it("maps the executor's balance actions to policy classes", () => {
    expect(actionClass({ kind: "split", amounts: {} })).toBe("split");
    expect(actionClass({ kind: "move", from: "operating", to: "emergency", amount: 1n })).toBe("split");
    expect(actionClass({ kind: "sweep", amount: 1n })).toBe("vault-sweep");
    expect(actionClass({ kind: "redeem", amount: 1n })).toBe("vault-redeem");
    expect(actionClass({ kind: "pay", from: "profit", amount: 1n })).toBe("payment");
    expect(actionClass({ kind: "salary", amount: 1n })).toBe("salary-day-one");
  });
});
