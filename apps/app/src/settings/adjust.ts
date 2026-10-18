import type { PlanNotice } from "@strickle/agent/notice-schema";
import type { Action } from "@strickle/agent/signed";
import { validateParameterProposal } from "@strickle/brain";
import { isAddress, zeroAddress } from "viem";

export type AdjustError = "day" | "amount" | "payee" | "floor" | "target" | "order" | "box" | "currency";
export type AdjustAction = Extract<Action, { kind: "adjust" }>;
export type AdjustResult = { ok: true; action: AdjustAction } | { ok: false; error: AdjustError };

const MICRO = 1_000_000n;

export function parseWholeDollars(text: string): number | null {
  const trimmed = text.trim();
  return /^[0-9]{1,9}$/.test(trimmed) ? Number(trimmed) : null;
}

const units = (dollars: number): string => (BigInt(dollars) * MICRO).toString();
const done = (changes: AdjustAction["changes"]): AdjustResult => ({ ok: true, action: { kind: "adjust", changes } });

export function salaryChange(input: { proposedDollars?: string; day?: string; payee?: string }): AdjustResult {
  const changes: AdjustAction["changes"] = {};
  if (input.proposedDollars !== undefined) {
    const dollars = parseWholeDollars(input.proposedDollars);
    if (dollars === null || dollars === 0) return { ok: false, error: "amount" };
    changes.salaryProposed = units(dollars);
  }
  if (input.day !== undefined) {
    const day = Number(input.day);
    if (!Number.isInteger(day) || day < 1 || day > 28) return { ok: false, error: "day" };
    changes.salaryDay = day;
  }
  if (input.payee !== undefined) {
    if (!isAddress(input.payee) || input.payee.toLowerCase() === zeroAddress) return { ok: false, error: "payee" };
    changes.payee = input.payee;
  }
  return Object.keys(changes).length === 0 ? { ok: false, error: "amount" } : done(changes);
}

const EURO_BOXES = ["payroll", "operating", "emergency", "profit"] as const;

/** Taxes and the salary are always dollars, so only four boxes can be declared in euros. */
export function currencyChange(input: { box: (typeof EURO_BOXES)[number]; to: "USD" | "EUR" }): AdjustResult {
  if (!EURO_BOXES.includes(input.box)) return { ok: false, error: "box" };
  if (input.to !== "USD" && input.to !== "EUR") return { ok: false, error: "currency" };
  return done({ currencies: { [input.box]: input.to } });
}

/** Whether the agent may put money no box needs soon to work; the owner's choice, in force once the agent's own plan says so. */
export const yieldChange = (enabled: boolean): AdjustResult => done({ yieldEnabled: enabled });

export function limitsChange(input: { thresholdDollars?: string; dailyCapDollars?: string }): AdjustResult {
  const changes: AdjustAction["changes"] = {};
  if (input.thresholdDollars !== undefined) {
    const dollars = parseWholeDollars(input.thresholdDollars);
    if (dollars === null) return { ok: false, error: "amount" };
    changes.signatureThreshold = units(dollars);
  }
  if (input.dailyCapDollars !== undefined) {
    const dollars = parseWholeDollars(input.dailyCapDollars);
    if (dollars === null) return { ok: false, error: "amount" };
    changes.dailyCap = units(dollars);
  }
  return Object.keys(changes).length === 0 ? { ok: false, error: "amount" } : done(changes);
}

/** The agent enforces one number: a salary payment above the threshold waits for the owner's signature. */
export function presetChange(preset: "ask" | "auto", autoUpToDollars: string): AdjustResult {
  if (preset === "ask") return done({ signatureThreshold: "0" });
  const dollars = parseWholeDollars(autoUpToDollars);
  return dollars === null || dollars === 0 ? { ok: false, error: "amount" } : done({ signatureThreshold: units(dollars) });
}

export function cushionRanges(current: { floorDays: number; targetDays: number }): { floor: [number, number]; target: [number, number] } {
  return { floor: [7, Math.min(30, current.targetDays)], target: [Math.max(14, current.floorDays), 90] };
}

export function cushionChange(input: { floorDays?: string; targetDays?: string; current: { floorDays: number; targetDays: number } }): AdjustResult {
  const changes: AdjustAction["changes"] = {};
  const floor = input.floorDays === undefined ? undefined : Number(input.floorDays);
  const target = input.targetDays === undefined ? undefined : Number(input.targetDays);
  if (floor !== undefined && target !== undefined && floor > target) return { ok: false, error: "order" };
  const context = { floorDays: floor ?? input.current.floorDays, targetDays: target ?? input.current.targetDays };
  if (floor !== undefined) {
    const check = validateParameterProposal("floorDays", floor, { floorDays: input.current.floorDays, targetDays: context.targetDays });
    if (check.status !== "accepted") return { ok: false, error: "floor" };
    changes.floorDays = floor;
  }
  if (target !== undefined) {
    const check = validateParameterProposal("targetDays", target, { floorDays: context.floorDays, targetDays: input.current.targetDays });
    if (check.status !== "accepted") return { ok: false, error: "target" };
    changes.targetDays = target;
  }
  return Object.keys(changes).length === 0 ? { ok: false, error: "floor" } : done(changes);
}

/** True when the agent's own plan shows every requested change as the value now in force. */
export function settingsMatch(changes: AdjustAction["changes"], settings: PlanNotice["settings"]): boolean {
  return (
    (changes.salaryProposed === undefined || settings.proposed === changes.salaryProposed) &&
    (changes.salaryDay === undefined || settings.day === changes.salaryDay) &&
    (changes.payee === undefined || settings.payee.toLowerCase() === changes.payee.toLowerCase()) &&
    (changes.dailyCap === undefined || settings.dailyCap === changes.dailyCap) &&
    (changes.signatureThreshold === undefined || settings.signatureThreshold === changes.signatureThreshold) &&
    (changes.floorDays === undefined || settings.floorDays === changes.floorDays) &&
    (changes.targetDays === undefined || settings.targetDays === changes.targetDays) &&
    (changes.yieldEnabled === undefined || (settings.yieldEnabled ?? false) === changes.yieldEnabled) &&
    (changes.currencies === undefined || Object.entries(changes.currencies).every(([box, currency]) => settings.currencies?.[box as keyof NonNullable<typeof settings.currencies>] === currency))
  );
}
