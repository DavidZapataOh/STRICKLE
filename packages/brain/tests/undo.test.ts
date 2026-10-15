import { describe, expect, it } from "vitest";
import type { InvariantPolicy } from "../src/invariants.ts";
import { type FactValue, type Facts } from "../src/templates.ts";
import { buildReceipt } from "../src/receipt.ts";
import { undoPlan } from "../src/undo.ts";
import { addDays } from "@strickle/core";
import { asOf, snap } from "./fixtures.ts";

const policy: InvariantPolicy = { dailyCap: 500n, signatureThreshold: 300n };
const usdc = (units: bigint): FactValue => ({ type: "amount", units, decimals: 6, symbol: "USDC" });
const amountFacts = (kind: Facts["kind"], units: bigint, labels: Record<string, string> = {}): Facts => ({ kind, values: { amount: usdc(units) }, labels });
const receipt = (kind: Facts["kind"], facts: Facts) => buildReceipt({ kind, ruleId: "r", facts, createdAt: 1_000, sequence: 0 });
const state = (over: object = {}) => ({ snapshot: snap(), now: 5_000, undone: new Set<string>(), ...over });

describe("undoPlan: vault moves", () => {
  it("undoes a sweep with a redeem of the same amount", () => {
    const r = receipt("vault-sweep", amountFacts("vault-sweep", 200n, { vault: "Morpho" }));
    expect(undoPlan(r, state({ snapshot: snap({ liquid: 1_050n, inVaults: 200n }) }), policy)).toEqual({ undoable: true, steps: [{ kind: "redeem", amount: 200n }] });
  });
  it("undoes a redeem with a sweep of the same amount", () => {
    const r = receipt("vault-redeem", amountFacts("vault-redeem", 200n, { vault: "Morpho" }));
    expect(undoPlan(r, state(), policy)).toEqual({ undoable: true, steps: [{ kind: "sweep", amount: 200n }] });
  });
  it("refuses an undo that the books cannot honour (the vault holds less than was swept)", () => {
    const r = receipt("vault-sweep", amountFacts("vault-sweep", 200n, { vault: "Morpho" }));
    expect(undoPlan(r, state({ snapshot: snap({ liquid: 1_250n, inVaults: 0n }) }), policy)).toMatchObject({ undoable: false, reason: expect.stringContaining("exceeds") });
  });
});

describe("undoPlan: emergency sweep, rate, proposals", () => {
  it("moves the amount back after the 24-hour soft lock, never immediately", () => {
    const r = receipt("emergency-sweep", amountFacts("emergency-sweep", 80n));
    expect(undoPlan(r, state(), policy)).toEqual({ undoable: true, steps: [{ kind: "move", from: "emergency", to: "operating", amount: 80n }], waitsUntil: 5_000 + 86_400 });
  });
  it("refuses an emergency undo larger than the fund", () => {
    const r = receipt("emergency-sweep", amountFacts("emergency-sweep", 101n));
    expect(undoPlan(r, state(), policy)).toMatchObject({ undoable: false });
  });
  it("restores the previous tax rate", () => {
    const facts: Facts = { kind: "taxes-recompute", values: { from: { type: "bps", value: 2_000 }, to: { type: "bps", value: 2_300 } }, labels: {} };
    expect(undoPlan(receipt("taxes-recompute", facts), state(), policy)).toEqual({ undoable: true, steps: [{ kind: "restore-rate", bps: 2_000 }] });
  });
  it("cancels a pending proposal", () => {
    const facts: Facts = { kind: "payment-proposal", values: { amount: usdc(900n) }, labels: { to: "Acme" } };
    expect(undoPlan(receipt("payment-proposal", facts), state(), policy)).toEqual({ undoable: true, steps: [{ kind: "cancel-proposal" }] });
  });
});

describe("undoPlan: not reversible and already undone", () => {
  it.each(["salary", "payment", "taxes-to-local"] as const)("%s", (kind) => {
    const facts = amountFacts(kind, 100n, { to: "x", currency: "MXN" });
    expect(undoPlan(receipt(kind, facts), state(), policy)).toMatchObject({ undoable: false, reason: expect.any(String) });
  });
  it("a split is not claimed to be reversible and points to moving between boxes", () => {
    const facts: Facts = {
      kind: "split",
      values: { total: usdc(2_000n), taxes: usdc(400n), payroll: usdc(900n), operating: usdc(200n), emergency: usdc(300n), salary: usdc(200n), profit: usdc(0n), rate: { type: "bps", value: 2_000 } },
      labels: {},
    };
    expect(undoPlan(receipt("split", facts), state(), policy)).toMatchObject({ undoable: false, reason: expect.stringContaining("moving") });
  });
  it("refuses a receipt that was already undone", () => {
    const r = receipt("vault-redeem", amountFacts("vault-redeem", 200n, { vault: "Morpho" }));
    expect(undoPlan(r, state({ undone: new Set([r.id]) }), policy)).toEqual({ undoable: false, reason: "this receipt was already undone" });
  });
  it("refuses a receipt that itself undoes another", () => {
    const original = receipt("vault-sweep", amountFacts("vault-sweep", 200n, { vault: "Morpho" }));
    const undo = buildReceipt({ kind: "vault-redeem", ruleId: "undo", facts: amountFacts("vault-redeem", 200n, { vault: "Morpho" }), createdAt: 2_000, sequence: 1, undoes: original.id });
    expect(undoPlan(undo, state(), policy)).toMatchObject({ undoable: false });
  });
});

describe("undoPlan: the invariants have the last word", () => {
  it("refuses to undo a vault redeem when sweeping the money back would leave the payroll due soon without liquid cash", () => {
    const due = { due: addDays(asOf, 2), amount: 300n };
    const r = receipt("vault-redeem", amountFacts("vault-redeem", 1_000n, { vault: "Morpho" }));
    const plan = undoPlan(r, state({ snapshot: snap({ payrolls: [due] }) }), policy); // liquid 1,250; sweeping 1,000 leaves 250 < 300
    expect(plan).toMatchObject({ undoable: false, reason: expect.stringContaining("safety"), violations: [expect.objectContaining({ code: "payroll-funded", gap: 50n })] });
    expect(undoPlan(receipt("vault-redeem", amountFacts("vault-redeem", 950n, { vault: "Morpho" })), state({ snapshot: snap({ payrolls: [due] }) }), policy)).toMatchObject({ undoable: true });
  });
  it("checks the emergency move as an owner request made after the soft lock", () => {
    const r = receipt("emergency-sweep", amountFacts("emergency-sweep", 80n));
    expect(undoPlan(r, state(), policy)).toMatchObject({ undoable: true, waitsUntil: 5_000 + 86_400 }); // evaluated with the lock open, so no emergency-routing violation
  });
});
