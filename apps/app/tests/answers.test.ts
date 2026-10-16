import { describe, expect, it } from "vitest";
import { emptyAnswers, fingerprint, fromLandingQuery, ready, startMode, stepsFor, usd, validate } from "../src/onboarding/answers.ts";

describe("fromLandingQuery", () => {
  it("reads what the landing simulator sends", () => {
    expect(fromLandingQuery({ amount: "3200", country: "CO", goal: "2000", lang: "es" })).toEqual({ monthlyIncomeUsd: 3200, country: "CO", salaryGoalUsd: 2000 });
  });

  it("ignores every field it cannot trust, one by one", () => {
    expect(fromLandingQuery({ amount: "-5", country: "ZZ", goal: "abc" })).toEqual({});
    expect(fromLandingQuery({ amount: "1e9", goal: "0" })).toEqual({});
    expect(fromLandingQuery({ amount: "3200.5" })).toEqual({});
    expect(fromLandingQuery({ amount: ["1", "2"], country: ["MX", "CO"] })).toEqual({});
    expect(fromLandingQuery({ country: "mx" })).toEqual({});
  });

  it("accepts the other countries the landing lists", () => {
    for (const country of ["AR", "BR", "MX", "NG", "IN", "PH", "OTHER"]) expect(fromLandingQuery({ country }).country).toBe(country);
  });
});

describe("startMode", () => {
  it("opens on the account step only when the link says login", () => {
    expect(startMode({ mode: "login" })).toBe("login");
    expect(startMode({})).toBe("register");
    expect(startMode({ mode: "other" })).toBe("register");
    expect(startMode({ mode: ["login", "login"] })).toBe("register");
  });
});

describe("fingerprint", () => {
  it("changes with any answer and is the same for the same answers", () => {
    expect(fingerprint(emptyAnswers)).toBe(fingerprint({ ...emptyAnswers }));
    expect(fingerprint({ ...emptyAnswers, salaryGoalUsd: 1 })).not.toBe(fingerprint(emptyAnswers));
    expect(fingerprint({ ...emptyAnswers, paymentDays: [5, 21] })).not.toBe(fingerprint(emptyAnswers));
  });
});

describe("steps", () => {
  it("asks about the regime only where the tax engine codes one", () => {
    for (const country of ["MX", "AR", "CO", "BR"] as const) expect(stepsFor({ ...emptyAnswers, country })).toContain("regime");
    for (const country of ["PH", "PK", "US", "IN", "NG", "OTHER"] as const) expect(stepsFor({ ...emptyAnswers, country })).not.toContain("regime");
    expect(stepsFor(emptyAnswers)).toEqual(["profile", "country", "income", "history", "review"]);
  });
});

describe("validate", () => {
  const filled = { ...emptyAnswers, collection: "stablecoin" as const, country: "MX" as const, regime: "coded" as const, monthlyIncomeUsd: 3200, salaryGoalUsd: 2000, payday: 1, paymentsPerMonth: 2 as const, paymentDays: [5, 20], emergencyMonths: 3 };

  it("passes a complete set and builds a Ready value", () => {
    for (const step of stepsFor(filled)) expect(validate(step, filled)).toEqual([]);
    expect(ready(filled)).not.toBeNull();
  });

  it("names what is missing or out of range", () => {
    expect(validate("profile", emptyAnswers)).toEqual(["collection"]);
    expect(validate("country", emptyAnswers)).toEqual(["country"]);
    expect(validate("income", { ...filled, monthlyIncomeUsd: 50 })).toEqual(["income"]);
    expect(validate("income", { ...filled, salaryGoalUsd: 0 })).toEqual(["goal"]);
    expect(validate("income", { ...filled, payday: 29 })).toEqual(["payday"]);
    expect(validate("history", { ...filled, paymentsPerMonth: 2, paymentDays: [5] })).toEqual(["days"]);
    expect(validate("history", { ...filled, paymentDays: [5, 5] })).toEqual(["days"]);
    expect(validate("history", { ...filled, paymentDays: [0, 31] })).toEqual(["days"]);
    expect(ready({ ...filled, country: null })).toBeNull();
  });
});

describe("usd", () => {
  it("turns whole dollars into six-decimal units", () => {
    expect(usd(1)).toBe(1_000_000n);
    expect(usd(1_000_000)).toBe(1_000_000_000_000n);
  });

  it("refuses what is not a whole non-negative number of dollars", () => {
    expect(() => usd(1.5)).toThrow();
    expect(() => usd(-1)).toThrow();
  });
});
