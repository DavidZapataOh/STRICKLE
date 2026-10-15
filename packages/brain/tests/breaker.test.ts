import { plainDate } from "@strickle/core";
import { describe, expect, it } from "vitest";
import { type BreakerState, guard, observe, reset } from "../src/breaker.ts";
import type { Action, InvariantPolicy } from "../src/invariants.ts";
import { predict } from "../src/invariants.ts";
import { snap } from "./fixtures.ts";

const policy: InvariantPolicy = { dailyCap: 500n, signatureThreshold: 300n };
const running: BreakerState = { status: "running" };
const bad: Action = { kind: "pay", from: "taxes", amount: 10n };
const good: Action = { kind: "move", from: "profit", to: "operating", amount: 10n };
const later = plainDate(2026, 10, 16);

describe("guard", () => {
  it("allows a valid action while running", () => {
    expect(guard(running, snap(), good, policy)).toEqual({ allow: true });
  });
  it("refuses an action whose predicted result violates an invariant, and the state is untouched", () => {
    const result = guard(running, snap(), bad, policy);
    expect(result).toEqual({ allow: false, reason: "violations", violations: [expect.objectContaining({ code: "taxes-untouched" })] });
    expect(running).toEqual({ status: "running" });
  });
  it("refuses an impossible action as invalid, not as a thrown error", () => {
    expect(guard(running, snap(), { kind: "pay", from: "profit", amount: 9_999n }, policy)).toEqual({ allow: false, reason: "invalid-action", message: expect.stringContaining("exceeds") });
  });
  it("refuses everything while halted, even a valid action", () => {
    const halted: BreakerState = { status: "halted", since: later, violations: [] };
    expect(guard(halted, snap(), good, policy)).toEqual({ allow: false, reason: "halted" });
  });
});

describe("observe", () => {
  it("stays running after a clean real result", () => {
    expect(observe(running, snap(), predict(snap(), good), good, policy)).toEqual({ status: "running" });
  });
  it("halts on a real result that breaks the books even when no relative invariant worsened", () => {
    const broken = { ...predict(snap(), good), liquid: 1_300n };
    const state = observe(running, snap(), broken, good, policy);
    expect(state).toEqual({ status: "halted", since: snap().asOf, violations: [expect.objectContaining({ code: "books-balance", gap: 50n })] });
  });
  it("halts on a real result that worsens an invariant", () => {
    const state = observe(running, snap(), predict(snap(), bad), bad, policy);
    expect(state).toMatchObject({ status: "halted", violations: [expect.objectContaining({ code: "taxes-untouched" })] });
  });
  it("is sticky: a clean snapshot or a second violation does not change a halted breaker", () => {
    const first = observe(running, snap(), predict(snap(), bad), bad, policy);
    expect(observe(first, snap(), predict(snap(), good), good, policy)).toEqual(first);
    expect(observe(first, snap(), { ...predict(snap(), good), liquid: 1_300n }, good, policy)).toEqual(first);
  });
});

describe("reset", () => {
  const halted: BreakerState = { status: "halted", since: later, violations: [{ code: "daily-cap", gap: 5n, detail: "x" }] };
  it("returns to running with an audit entry naming the actor and what was cleared", () => {
    expect(reset(halted, "maria@example.com", later)).toEqual({ state: { status: "running" }, audit: { actor: "maria@example.com", at: later, cleared: halted.violations } });
  });
  it("needs an actor and refuses to reset a running breaker", () => {
    expect(() => reset(halted, "  ", later)).toThrow(RangeError);
    expect(() => reset(running, "maria", later)).toThrow(/running/);
  });
});
