import { type PlainDate, addMonths, daysInMonth, formatPlainDate, plainDate } from "@strickle/core";
import { type Profile, encodeProfile, profileSchema } from "@strickle/agent/profile";
import { profileAad } from "@strickle/agent/keys";
import { seal } from "@strickle/prover/sealed";
import { type Address, type Hex, bytesToHex, hexToBytes } from "viem";
import { usd } from "./answers.ts";
import type { Diagnosis } from "./diagnosis.ts";
import type { Ready } from "./types.ts";

const MONTHS = 12;

/** The user's own estimate, spread over the last twelve full months; every entry is tagged so nobody mistakes it for imported income. */
export function estimateHistory(input: { monthlyIncomeUsd: number; paymentsPerMonth: number; paymentDays: number[]; today: PlainDate }): [string, string, string][] {
  const monthly = usd(input.monthlyIncomeUsd);
  const count = BigInt(input.paymentsPerMonth);
  const each = monthly / count;
  const days = [...input.paymentDays].sort((a, b) => a - b);
  const first = addMonths(plainDate(input.today.year, input.today.month, 1), -MONTHS);
  const out: [string, string, string][] = [];
  for (let month = 0; month < MONTHS; month++) {
    const start = addMonths(first, month);
    days.forEach((day, index) => {
      const amount = index === days.length - 1 ? monthly - each * (count - 1n) : each;
      out.push([formatPlainDate(plainDate(start.year, start.month, Math.min(day, daysInMonth(start.year, start.month)))), amount.toString(), "estimate"]);
    });
  }
  return out;
}

export function buildProfile({ answers, diagnosis, owner, today, userKey }: { answers: Ready; diagnosis: Diagnosis; owner: Address; today: PlainDate; userKey: Hex }): Profile {
  const goal = usd(answers.salaryGoalUsd);
  return profileSchema.parse({
    version: 1,
    taxRateBps: diagnosis.rateBps,
    taxBufferBps: 10_500,
    payrollShareBps: 10_000,
    floorDays: 14,
    targetDays: 42,
    dailySpend: diagnosis.dailySpend.toString(),
    payrollDue: "0",
    salaryOwed: goal.toString(),
    emergencyTarget: diagnosis.emergencyTarget.toString(),
    taxesDue: diagnosis.firstMonthReserve.toString(),
    taxDates: diagnosis.taxDates,
    // the public half of the key the user keeps their notices under; only the user can open what the agent seals to it
    userKey,
    salary: { proposed: goal.toString(), pending: "0", payee: owner, day: answers.payday, lastPaid: "" },
    limits: { dailyCap: goal.toString(), signatureThreshold: "0" },
    history: estimateHistory({ monthlyIncomeUsd: answers.monthlyIncomeUsd, paymentsPerMonth: answers.paymentsPerMonth, paymentDays: answers.paymentDays, today }),
  });
}

export function sealProfile({ profile, vault, enclaveKey }: { profile: Profile; vault: Address; enclaveKey: Hex }): Hex {
  return bytesToHex(seal(encodeProfile(profile), hexToBytes(enclaveKey), profileAad(vault)));
}
