import { join } from "node:path";
import { plainDate } from "@strickle/core";
import { loadRules } from "@strickle/tax-engine";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Review } from "../src/components/Review.tsx";
import en from "../src/i18n/dictionaries/en.json";
import { emptyAnswers } from "../src/onboarding/answers.ts";
import { diagnose } from "../src/onboarding/diagnosis.ts";
import type { Ready } from "../src/onboarding/types.ts";

const rules = loadRules(join(import.meta.dirname, "../../../packages/tax-engine/rules"));
const base: Ready = { ...emptyAnswers, collection: "stablecoin", country: "MX", regime: "coded", monthlyIncomeUsd: 3200, salaryGoalUsd: 2000, payday: 1 };
const render = (patch: Partial<Ready> = {}, spot?: string, regimeName?: string) => {
  const answers = { ...base, ...patch };
  const diagnosis = diagnose({ answers, rules, today: plainDate(2026, 10, 15), spot });
  return renderToStaticMarkup(<Review lang="en" t={en} answers={answers} diagnosis={diagnosis} regimeName={regimeName} confirmed={false} onConfirmed={() => undefined} emergency={<span>emergency</span>} />);
};

describe("the review of the plan", () => {
  it("says the tax rate and the regime, with the rule's source and its unverified status", () => {
    const out = render({ collection: "bank" }, "17.25", "Régimen Simplificado de Confianza");
    expect(out).toContain("1.5% of each payment goes to taxes, by Régimen Simplificado de Confianza");
    expect(out).toContain("Not yet verified by an accountant.");
    expect(out).toContain("Rule source");
  });

  it("warns a Mexican who collects in stablecoins and lists the broken conditions", () => {
    const out = render({}, "17.25");
    expect(out).toContain("Check before you collect in digital dollars");
    expect(out).toMatch(/<li>[^<]+<\/li>/);
  });

  it("explains the annual rate when no advance is due (Colombia)", () => {
    expect(render({ country: "CO" }, "4100", "Régimen Simple de Tributación")).toContain("asks for no payment in advance at your income, but the yearly tax is still owed");
  });

  it("gives the reason for a flat estimate in plain words", () => {
    expect(render({ country: "NG", regime: null })).toContain("We have no coded rule for your country yet.");
    expect(render({ country: "BR" }, "5.4")).toContain("Your income is outside the regime we code for your country.");
    expect(render({})).toContain("The exchange rate was not available just now.");
    expect(render({ country: "US", regime: null })).toContain("tax figures, which we do not have yet.");
  });

  it("states the first payment's split, the first month and the salary, labelled as the first month", () => {
    const out = render({ collection: "bank" }, "17.25");
    expect(out).toContain("Your first payment of US$1,600.00");
    expect(out).toContain("Your first month");
    expect(out).not.toContain("typical month");
    expect(out).toContain("US$2,000.00 on day 1");
  });

  it("says the part of the salary that stays pending", () => {
    expect(render({ monthlyIncomeUsd: 600, salaryGoalUsd: 2000, collection: "bank" }, "17.25")).toMatch(/US\$[\d,.]+ stays pending until your income covers it/);
  });

  it("tells the user that every salary waits for their approval and that the plan starts from their estimate and waits a day", () => {
    const out = render({ collection: "bank" }, "17.25");
    expect(out).toContain("Each salary payment waits for your approval");
    expect(out).toContain("Your plan starts from your own estimate");
    expect(out).toContain("about 24 hours after you finish");
  });

  it("requires the active confirmation", () => {
    expect(render({ collection: "bank" }, "17.25")).toContain("These percentages are my starting point");
  });
});
