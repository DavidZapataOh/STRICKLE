import { BOX_KINDS, type BoxKind } from "@strickle/core";
import type { Diagnosis } from "./diagnosis.ts";

/** The diagnosis as it crosses from the server action to the browser: every bigint as a decimal string. */
export interface DiagnosisJson {
  tax: Diagnosis["tax"];
  rateBps: number;
  month: { byBox: Record<string, string>; salaryPending: string; firstPayment: Record<string, string> };
  dailySpend: string;
  emergencyTarget: string;
  firstMonthReserve: string;
  eligibility: Diagnosis["eligibility"];
}

const text = (record: Record<BoxKind, bigint>): Record<string, string> => Object.fromEntries(BOX_KINDS.map((box) => [box, record[box].toString()]));
const units = (record: Record<string, string>): Record<BoxKind, bigint> => Object.fromEntries(BOX_KINDS.map((box) => [box, BigInt(record[box] ?? "0")])) as Record<BoxKind, bigint>;

export function toJson(diagnosis: Diagnosis): DiagnosisJson {
  return {
    tax: diagnosis.tax,
    rateBps: diagnosis.rateBps,
    month: { byBox: text(diagnosis.month.byBox), salaryPending: diagnosis.month.salaryPending.toString(), firstPayment: text(diagnosis.month.firstPayment) },
    dailySpend: diagnosis.dailySpend.toString(),
    emergencyTarget: diagnosis.emergencyTarget.toString(),
    firstMonthReserve: diagnosis.firstMonthReserve.toString(),
    eligibility: diagnosis.eligibility,
  };
}

/** The single way back from the wire shape to bigint amounts: the review screen and the profile builder both read the result. */
export function reviveDiagnosis(json: DiagnosisJson): Diagnosis {
  return {
    tax: json.tax,
    rateBps: json.rateBps,
    month: { byBox: units(json.month.byBox), salaryPending: BigInt(json.month.salaryPending), firstPayment: units(json.month.firstPayment) },
    dailySpend: BigInt(json.dailySpend),
    emergencyTarget: BigInt(json.emergencyTarget),
    firstMonthReserve: BigInt(json.firstMonthReserve),
    eligibility: json.eligibility,
  };
}
