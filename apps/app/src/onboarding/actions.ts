"use server";
import { plainDate } from "@strickle/core";
import { z } from "zod";
import { emptyAnswers, ready, validate } from "./answers.ts";
import { diagnose, latestSpot, loadAppRules } from "./diagnosis.ts";
import { type DiagnosisJson, toJson } from "./diagnosis-json.ts";
import { COUNTRIES } from "./types.ts";

const input = z
  .object({
    collection: z.enum(["stablecoin", "bank"]),
    country: z.enum(COUNTRIES),
    regime: z.enum(["coded", "other"]).nullable(),
    monthlyIncomeUsd: z.number().int(),
    salaryGoalUsd: z.number().int(),
    payday: z.number().int(),
    paymentsPerMonth: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
    paymentDays: z.array(z.number().int()).max(4),
    emergencyMonths: z.number().int(),
  })
  .strict();

export async function previewDiagnosis(raw: unknown): Promise<{ ok: true; diagnosis: DiagnosisJson } | { ok: false }> {
  const parsed = input.safeParse(raw);
  if (!parsed.success) return { ok: false };
  const answers = ready({ ...emptyAnswers, ...parsed.data });
  if (!answers || (["income", "history", "review"] as const).some((step) => validate(step, answers).length > 0)) return { ok: false };
  const now = new Date();
  const today = plainDate(now.getUTCFullYear(), now.getUTCMonth() + 1, now.getUTCDate());
  const spot = answers.regime === "coded" ? await latestSpot(answers.country) : undefined;
  return { ok: true, diagnosis: toJson(diagnose({ answers, rules: loadAppRules(), today, spot })) };
}
