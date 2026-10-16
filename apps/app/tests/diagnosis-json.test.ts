import { join } from "node:path";
import { plainDate } from "@strickle/core";
import { loadRules } from "@strickle/tax-engine";
import { describe, expect, it } from "vitest";
import { emptyAnswers } from "../src/onboarding/answers.ts";
import { diagnose } from "../src/onboarding/diagnosis.ts";
import { reviveDiagnosis, toJson } from "../src/onboarding/diagnosis-json.ts";
import type { Ready } from "../src/onboarding/types.ts";

const rules = loadRules(join(import.meta.dirname, "../../../packages/tax-engine/rules"));
const answers: Ready = { ...emptyAnswers, collection: "stablecoin", country: "MX", regime: "coded", monthlyIncomeUsd: 3200, salaryGoalUsd: 2000 };

describe("the diagnosis wire shape", () => {
  const diagnosis = diagnose({ answers, rules, today: plainDate(2026, 10, 15), spot: "17.25" });

  it("survives JSON and comes back identical, bigints included", () => {
    const wire = JSON.parse(JSON.stringify(toJson(diagnosis)));
    expect(reviveDiagnosis(wire)).toEqual(diagnosis);
  });

  it("carries no bigint on the wire", () => {
    expect(() => JSON.stringify(toJson(diagnosis))).not.toThrow();
  });

  it("carries the eligibility warning with the diagnosis", () => {
    expect(toJson(diagnosis).eligibility.status).toBe("warn");
  });

  it("carries the tax dates through the wire and revives them", () => {
    expect(diagnosis.taxDates).toHaveLength(6);
    expect(reviveDiagnosis(JSON.parse(JSON.stringify(toJson(diagnosis)))).taxDates).toEqual(diagnosis.taxDates);
  });
});
