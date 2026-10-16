import { join } from "node:path";
import { plainDate } from "@strickle/core";
import { loadRules } from "@strickle/tax-engine";
import { describe, expect, it } from "vitest";
import { emptyAnswers, usd } from "../src/onboarding/answers.ts";
import type { Ready } from "../src/onboarding/types.ts";
import { diagnose, latestSpot, monthlyLocalMinor, regimeNames, usdUnitsFromLocalMinor } from "../src/onboarding/diagnosis.ts";

const rules = loadRules(join(import.meta.dirname, "../../../packages/tax-engine/rules"));
const today = plainDate(2026, 10, 15);
const base: Ready = { ...emptyAnswers, collection: "stablecoin", country: "MX", regime: "coded", monthlyIncomeUsd: 3200, salaryGoalUsd: 2000, payday: 1, paymentsPerMonth: 2, paymentDays: [5, 20], emergencyMonths: 3 };
const run = (patch: Partial<Ready> = {}, spot?: string) => diagnose({ answers: { ...base, ...patch }, rules, today, spot });

describe("currency bridges", () => {
  it("converts dollars to local minor units and back at a spot rate", () => {
    expect(monthlyLocalMinor(usd(100), "17.250000")).toBe(172_500n);
    expect(usdUnitsFromLocalMinor(172_500n, "17.250000")).toBe(usd(100));
  });
  it("refuses a spot that is not a positive decimal", () => {
    expect(() => monthlyLocalMinor(usd(1), "0")).toThrow();
    expect(() => monthlyLocalMinor(usd(1), "abc")).toThrow();
  });
});

describe("tax basis from the shipped rules", () => {
  it("reserves the zero-rated VAT away when the guardian says the export conditions hold (Mexico, bank)", () => {
    const diagnosis = run({ collection: "bank" }, "17.25");
    expect(diagnosis.tax).toMatchObject({ origin: "rule", ruleId: "mx-resico-pf", basis: "monthly", fx: "used" });
    expect(diagnosis.eligibility.status).toBe("ok");
    expect(diagnosis.rateBps).toBe(150);
  });

  it("keeps the VAT reserved while the guardian only warns (Mexico, stablecoin)", () => {
    const diagnosis = run({ collection: "stablecoin" }, "17.25");
    expect(diagnosis.eligibility.status).toBe("warn");
    expect(diagnosis.rateBps).toBe(1_750);
  });

  it("never shows zero for Colombia: below the advance threshold the annual SIMPLE rate is reserved", () => {
    for (const income of [2000, 3200]) {
      const diagnosis = run({ country: "CO", monthlyIncomeUsd: income }, "4100");
      expect(diagnosis.tax).toMatchObject({ origin: "rule", basis: "annual" });
      expect(diagnosis.rateBps).toBe(590);
    }
  });

  it("uses the bimonthly advance rate once the advance is due (Colombia, high income)", () => {
    const diagnosis = run({ country: "CO", monthlyIncomeUsd: 9000 }, "4100");
    expect(diagnosis.tax.basis).toBe("advance");
    expect(diagnosis.rateBps).toBe(1_460);
  });

  it("shows a fixed-fee regime as the rate of a typical month (Argentina)", () => {
    const diagnosis = run({ country: "AR" }, "1400");
    expect(diagnosis.tax.basis).toBe("fixed-fee");
    expect(diagnosis.rateBps).toBe(515);
  });

  it("falls back to the flat first-year estimate and says exactly why", () => {
    expect(run({}).tax).toMatchObject({ origin: "fallback", fallback: "rate-unavailable", fx: "unavailable", basis: "flat" });
    expect(run({ regime: "other" }, "17.25").tax.fallback).toBe("other-regime");
    expect(run({ country: "NG", regime: null }).tax).toMatchObject({ fallback: "no-rule", fx: "not-needed" });
    expect(run({ country: "US", regime: null }).tax.fallback).toBe("needs-prior-year");
    expect(run({ country: "BR" }, "5.4").tax.fallback).toBe("out-of-regime");
    for (const diagnosis of [run({}), run({ country: "NG", regime: null }), run({ country: "BR" }, "5.4")]) expect(diagnosis.rateBps).toBe(3_000);
  });

  it("is honest about verification: every shipped rule is unverified today", () => {
    expect(run({}, "17.25").tax.verified).toBe(false);
  });
});

describe("the month preview", () => {
  it("is the real cascade run payment by payment: every box sums to the income", () => {
    const { month } = run({}, "17.25");
    expect(Object.values(month.byBox).reduce((sum, value) => sum + value, 0n)).toBe(usd(3200));
    expect(Object.values(month.firstPayment).reduce((sum, value) => sum + value, 0n)).toBe(usd(1600));
  });

  it("puts taxes first, then the operating floor, then the salary", () => {
    const { month, rateBps } = run({}, "17.25");
    expect(month.firstPayment.taxes).toBe((usd(1600) * BigInt(rateBps) * 10_500n + 99_999_999n) / 100_000_000n);
    expect(month.firstPayment.operating).toBeGreaterThan(0n);
  });

  it("reports the part of the salary the month cannot fund as pending", () => {
    expect(run({ salaryGoalUsd: 1000 }, "17.25").month.salaryPending).toBe(0n);
    expect(run({ monthlyIncomeUsd: 600, salaryGoalUsd: 2000 }, "17.25").month.salaryPending).toBeGreaterThan(0n);
  });

  it("derives the daily spend and the emergency target from the confirmed goal", () => {
    const diagnosis = run({ salaryGoalUsd: 3000, emergencyMonths: 4 }, "17.25");
    expect(diagnosis.dailySpend).toBe(usd(3000) / 30n);
    expect(diagnosis.emergencyTarget).toBe(usd(12000));
  });
});

describe("regime names", () => {
  it("names the regime of each country the app codes, in the rule file's own words, short", () => {
    expect(regimeNames(rules, today)).toEqual({
      MX: "Régimen Simplificado de Confianza",
      AR: "Monotributo",
      CO: "Régimen Simple de Tributación",
      BR: "MEI (Microempreendedor Individual)",
    });
  });
});

describe("eligibility guardian", () => {
  it("is not applicable where no eligibility rule exists", () => {
    expect(run({ country: "CO", regime: "coded" }, "4100").eligibility).toEqual({ status: "not-applicable" });
  });
});

describe.skipIf(!process.env.RUN_FX_LIVE)("live exchange rate", () => {
  it.each(["MX", "BR", "CO", "AR"] as const)("%s has a positive spot from its published source", async (country) => {
    expect(Number(await latestSpot(country, 10_000))).toBeGreaterThan(0);
  });
  it("has none for a country without a source", async () => {
    expect(await latestSpot("NG")).toBeUndefined();
  });
});
