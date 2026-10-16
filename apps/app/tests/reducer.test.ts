import { describe, expect, it } from "vitest";
import { fingerprint } from "../src/onboarding/answers.ts";
import type { DiagnosisJson } from "../src/onboarding/diagnosis-json.ts";
import { initialState, reduce } from "../src/onboarding/reducer.ts";

const diagnosis = { rateBps: 2000 } as unknown as DiagnosisJson;
const fill = (state = initialState({})) =>
  reduce(reduce(state, { type: "set", patch: { collection: "stablecoin", country: "NG" } }), { type: "set", patch: { monthlyIncomeUsd: 3200, salaryGoalUsd: 2000 } });
const atReview = () => {
  let state = fill();
  for (let i = 0; i < 4; i++) state = reduce(state, { type: "next" });
  return state;
};

describe("the wizard reducer", () => {
  it("starts at the first step, empty, or prefilled from the landing", () => {
    expect(initialState({}).step).toBe("profile");
    expect(initialState({ country: "MX", monthlyIncomeUsd: 3200 }).answers).toMatchObject({ country: "MX", monthlyIncomeUsd: 3200 });
  });

  it("opens on the account step for someone who already has an account", () => {
    const state = initialState({}, "login");
    expect(state).toMatchObject({ phase: "account", accountMode: "login" });
  });

  it("does not advance with a missing answer and names it", () => {
    const state = reduce(initialState({}), { type: "next" });
    expect(state.step).toBe("profile");
    expect(state.errors).toEqual(["collection"]);
  });

  it("walks the steps of the chosen country and can go back", () => {
    let state = reduce(fill(), { type: "next" });
    expect(state.step).toBe("country");
    state = reduce(state, { type: "next" });
    expect(state.step).toBe("income");
    expect(reduce(state, { type: "back" }).step).toBe("country");
  });

  it("shows the regime step only for a country with a coded regime", () => {
    let state = reduce(initialState({}), { type: "set", patch: { collection: "bank", country: "MX" } });
    state = reduce(reduce(state, { type: "next" }), { type: "next" });
    expect(state.step).toBe("regime");
  });

  it("starts a new country without the regime chosen for the old one", () => {
    let state = reduce(initialState({}), { type: "set", patch: { collection: "bank", country: "MX", regime: "coded" } });
    state = reduce(state, { type: "set", patch: { country: "BR" } });
    expect(state.answers.regime).toBeNull();
    expect(reduce(state, { type: "set", patch: { salaryGoalUsd: 1 } }).answers.country).toBe("BR");
  });

  it("drops a stale diagnosis when an answer changes", () => {
    let state = atReview();
    state = reduce(state, { type: "diagnosis", value: diagnosis, fingerprint: fingerprint(state.answers) });
    expect(state.diagnosis).not.toBeNull();
    expect(reduce(state, { type: "set", patch: { salaryGoalUsd: 1500 } }).diagnosis).toBeNull();
  });

  it("ignores a diagnosis that was computed for answers the user has since changed", () => {
    let state = atReview();
    const old = fingerprint(state.answers);
    state = reduce(state, { type: "set", patch: { salaryGoalUsd: 1500 } });
    state = reduce(state, { type: "diagnosis", value: diagnosis, fingerprint: old });
    expect(state.diagnosis).toBeNull();
    state = reduce(state, { type: "failed", fingerprint: old });
    expect(state.status).toBe("idle");
  });

  it("keeps the payment days in line with the number of payments", () => {
    const state = reduce(initialState({}), { type: "set", patch: { paymentsPerMonth: 3 } });
    expect(state.answers.paymentDays).toHaveLength(3);
    expect(new Set(state.answers.paymentDays).size).toBe(3);
  });

  it("only leaves the questions for the account step from a confirmed review with a diagnosis", () => {
    let state = atReview();
    expect(state.step).toBe("review");
    expect(reduce(state, { type: "account" }).phase).toBe("questions");
    state = reduce(state, { type: "diagnosis", value: diagnosis, fingerprint: fingerprint(state.answers) });
    expect(reduce(state, { type: "account" }).phase).toBe("account");
  });

  it("goes to the account step in login mode without any answers", () => {
    expect(reduce(initialState({}), { type: "account", mode: "login" })).toMatchObject({ phase: "account", accountMode: "login" });
  });
});
