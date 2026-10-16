import { plainDate } from "@strickle/core";
import { MAX_SUBMITTED_BYTES, encodeProfile, profileSchema } from "@strickle/agent/profile";
import { deriveSealKey, parseMaster, profileAad } from "@strickle/agent/keys";
import { open } from "@strickle/prover/sealed";
import { bytesToHex, getAddress, hexToBytes } from "viem";
import { describe, expect, it } from "vitest";
import { emptyAnswers, usd } from "../src/onboarding/answers.ts";
import type { Diagnosis } from "../src/onboarding/diagnosis.ts";
import { buildProfile, estimateHistory, sealProfile } from "../src/onboarding/profile.ts";
import type { Ready } from "../src/onboarding/types.ts";

const today = plainDate(2026, 10, 15);
const owner = getAddress("0x00000000000000000000000000000000000000b2");
const vault = getAddress("0x00000000000000000000000000000000000000a1");
const answers: Ready = { ...emptyAnswers, collection: "stablecoin", country: "MX", regime: "coded", monthlyIncomeUsd: 3200, salaryGoalUsd: 2000, payday: 1, paymentsPerMonth: 2, paymentDays: [5, 20], emergencyMonths: 3 };
const userKey = `0x${"cd".repeat(32)}` as const;
const diagnosis: Diagnosis = {
  tax: { rateBps: 2000, origin: "rule", ruleId: "mx-resico-pf", regime: "RESICO", verified: false, sourceUrl: "https://example.test", basis: "monthly", fx: "used" },
  rateBps: 2000,
  month: { byBox: {} as never, salaryPending: 0n, firstPayment: {} as never },
  dailySpend: usd(2000) / 30n,
  emergencyTarget: usd(6000),
  firstMonthReserve: usd(640),
  taxDates: ["2026-11-17", "2026-12-17"],
  eligibility: { status: "not-applicable" },
};

describe("estimateHistory", () => {
  it("covers the twelve previous full months, every payment tagged as an estimate", () => {
    const history = estimateHistory({ monthlyIncomeUsd: 3200, paymentsPerMonth: 2, paymentDays: [5, 20], today });
    expect(history).toHaveLength(24);
    expect(history[0]).toEqual(["2025-10-05", "1600000000", "estimate"]);
    expect(history.at(-1)?.[0]).toBe("2026-09-20");
    expect(history.every(([, , source]) => source === "estimate")).toBe(true);
  });

  it("sums to the stated income every month, remainders on the last payment", () => {
    const history = estimateHistory({ monthlyIncomeUsd: 1000, paymentsPerMonth: 3, paymentDays: [3, 12, 25], today });
    const byMonth = new Map<string, bigint>();
    for (const [date, amount] of history) byMonth.set(date.slice(0, 7), (byMonth.get(date.slice(0, 7)) ?? 0n) + BigInt(amount));
    expect(byMonth.size).toBe(12);
    for (const total of byMonth.values()) expect(total).toBe(usd(1000));
  });
});

describe("buildProfile", () => {
  const profile = buildProfile({ answers, diagnosis, owner, today, userKey });

  it("is a valid profile for the enclave's own schema", () => {
    expect(profileSchema.safeParse(profile).success).toBe(true);
  });

  it("carries the confirmed numbers and fails closed everywhere else", () => {
    expect(profile).toMatchObject({
      taxRateBps: 2000,
      taxBufferBps: 10_500,
      floorDays: 14,
      targetDays: 42,
      salaryOwed: String(usd(2000)),
      emergencyTarget: String(usd(6000)),
      taxesDue: String(usd(640)),
      salary: { proposed: String(usd(2000)), pending: "0", payee: owner, day: 1, lastPaid: "" },
      limits: { dailyCap: String(usd(2000)), signatureThreshold: "0" },
      userKey,
      privateMode: { enabled: false },
    });
  });

  it("never submits a zero user key: the agent could not address a notice to it", () => {
    expect(profile.userKey).not.toBe(`0x${"0".repeat(64)}`);
  });

  it("tags the whole history as the user's own estimate", () => {
    expect(profile.history.length).toBeGreaterThan(0);
    expect(profile.history.every(([, , source]) => source === "estimate")).toBe(true);
  });

  it("stays under the submission limit at the extremes", () => {
    const extreme = buildProfile({ answers: { ...answers, monthlyIncomeUsd: 1_000_000, salaryGoalUsd: 1_000_000, payday: 28, paymentsPerMonth: 4, paymentDays: [1, 9, 18, 28] }, diagnosis, owner, today, userKey });
    expect(encodeProfile(extreme).length).toBeLessThanOrEqual(MAX_SUBMITTED_BYTES);
    expect(profileSchema.safeParse(extreme).success).toBe(true);
  });

  it("carries the diagnosis's tax dates to the agent", () => {
    expect(profile.taxDates).toEqual(["2026-11-17", "2026-12-17"]);
  });
});

describe("sealProfile", () => {
  it("opens only for the enclave key and only for the same vault, and carries exactly the profile", () => {
    const key = deriveSealKey(parseMaster(`0x${"11".repeat(32)}`));
    const profile = buildProfile({ answers, diagnosis, owner, today, userKey });
    const sealed = sealProfile({ profile, vault, enclaveKey: bytesToHex(key.publicKey) });
    const opened = open(hexToBytes(sealed), key.secret, key.publicKey, profileAad(vault));
    expect(opened && new TextDecoder().decode(opened)).toBe(new TextDecoder().decode(encodeProfile(profile)));
    expect(open(hexToBytes(sealed), key.secret, key.publicKey, profileAad(getAddress("0x00000000000000000000000000000000000000a2")))).toBeUndefined();
  });
});
