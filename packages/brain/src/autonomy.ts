import type { BreakerState } from "./breaker.ts";
import type { Action } from "./invariants.ts";

export type ActionKind = "split" | "taxes-recompute" | "vault-sweep" | "vault-redeem" | "salary-day-one" | "taxes-to-local" | "salary-raise" | "structural-change" | "payment";

export interface AutonomyRecord {
  /** Consecutive tax due dates paid without incident. */
  cleanTaxDueDates: number;
  paymentCap: bigint;
  paymentCapStart: bigint;
  paymentCapCeiling: bigint;
  cleanMonths: number;
}

export interface AutonomyPolicy {
  capStep: bigint;
  /** Above this amount a human signature is needed (the breaker's `signature-required`), so the action is proposed instead. Unset: no extra rule here. */
  signatureThreshold?: bigint;
  capStepEvery?: number;
  taxesToLocalAfter?: number;
}

export interface ActionRequest {
  kind: ActionKind;
  amount?: bigint;
  rateChangeBps?: number;
  recipientAllowlisted?: boolean;
}

export type ProposeReason = "always-proposed" | "not-yet-earned" | "above-cap" | "recipient-not-allowlisted" | "needs-signature";
export type Decision = { mode: "auto"; notify?: boolean } | { mode: "propose"; reason: ProposeReason } | { mode: "blocked"; reason: "halted" };

export const DEFAULT_TAXES_TO_LOCAL_AFTER = 2;
export const DEFAULT_CAP_STEP_EVERY = 3;
const NOTIFY_ABOVE_BPS = 200;

export function decideAutonomy(request: ActionRequest, record: AutonomyRecord, breaker: BreakerState, policy: AutonomyPolicy): Decision {
  if (breaker.status === "halted") return { mode: "blocked", reason: "halted" };
  switch (request.kind) {
    case "split":
    case "vault-sweep":
    case "vault-redeem":
      return { mode: "auto" };
    case "salary-day-one":
      return policy.signatureThreshold !== undefined && (request.amount ?? 0n) > policy.signatureThreshold ? { mode: "propose", reason: "needs-signature" } : { mode: "auto" };
    case "taxes-recompute":
      return Math.abs(request.rateChangeBps ?? 0) > NOTIFY_ABOVE_BPS ? { mode: "auto", notify: true } : { mode: "auto" };
    case "salary-raise":
    case "structural-change":
      return { mode: "propose", reason: "always-proposed" };
    case "taxes-to-local":
      return record.cleanTaxDueDates >= (policy.taxesToLocalAfter ?? DEFAULT_TAXES_TO_LOCAL_AFTER) ? { mode: "auto" } : { mode: "propose", reason: "not-yet-earned" };
    case "payment": {
      if (request.amount === undefined || request.amount < 0n) throw new RangeError("a payment needs a non-negative amount");
      if (request.recipientAllowlisted !== true) return { mode: "propose", reason: "recipient-not-allowlisted" };
      if (request.amount > record.paymentCap) return { mode: "propose", reason: "above-cap" };
      return policy.signatureThreshold !== undefined && request.amount > policy.signatureThreshold ? { mode: "propose", reason: "needs-signature" } : { mode: "auto" };
    }
  }
}

/** The executor's balance actions belong to a policy class; moves between boxes follow the cascade's rules and count as a split. */
export function actionClass(action: Action): ActionKind {
  switch (action.kind) {
    case "split":
    case "move":
      return "split";
    case "sweep":
      return "vault-sweep";
    case "redeem":
      return "vault-redeem";
    case "pay":
      return "payment";
    case "salary":
      return "salary-day-one";
  }
}

export type Outcome = { kind: "tax-due-paid-clean" } | { kind: "incident" } | { kind: "clean-month" };

function validate(record: AutonomyRecord): void {
  if (record.cleanTaxDueDates < 0 || record.cleanMonths < 0 || !Number.isInteger(record.cleanTaxDueDates) || !Number.isInteger(record.cleanMonths)) throw new RangeError("the clean counters must be non-negative integers");
  if (record.paymentCap < 0n || record.paymentCapStart < 0n || record.paymentCapCeiling < 0n) throw new RangeError("the payment cap values must not be negative");
}

export function recordOutcome(record: AutonomyRecord, outcome: Outcome, policy: AutonomyPolicy): AutonomyRecord {
  validate(record);
  if (policy.capStep < 0n) throw new RangeError("capStep must not be negative");
  switch (outcome.kind) {
    case "tax-due-paid-clean":
      return { ...record, cleanTaxDueDates: record.cleanTaxDueDates + 1 };
    case "incident":
      return { ...record, cleanTaxDueDates: 0, cleanMonths: 0, paymentCap: record.paymentCapStart };
    case "clean-month": {
      const cleanMonths = record.cleanMonths + 1;
      const raise = cleanMonths % (policy.capStepEvery ?? DEFAULT_CAP_STEP_EVERY) === 0;
      const raised = record.paymentCap + policy.capStep;
      const paymentCap = raise ? (raised > record.paymentCapCeiling ? record.paymentCapCeiling : raised) : record.paymentCap;
      return { ...record, cleanMonths, paymentCap };
    }
  }
}

/** How many of the two earnable permissions are on: taxes to local currency automatic, and a payment cap above its start. */
export function autonomyLevel(record: AutonomyRecord, policy: AutonomyPolicy = { capStep: 0n }): { earned: number; of: 2; label: "standard" | "turbo" } {
  validate(record);
  const earned = Number(record.cleanTaxDueDates >= (policy.taxesToLocalAfter ?? DEFAULT_TAXES_TO_LOCAL_AFTER)) + Number(record.paymentCap > record.paymentCapStart);
  return { earned, of: 2, label: earned === 2 ? "turbo" : "standard" };
}
