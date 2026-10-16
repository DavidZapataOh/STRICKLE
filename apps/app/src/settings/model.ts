import type { PlanNotice } from "@strickle/agent/notice-schema";
import { type Address, zeroAddress } from "viem";
import { type SettingsChain, approvalKey, approvalState } from "./chain.ts";

export type AgentState = "running" | "paused" | "halted-user" | "halted-safety" | "none";

export type SettingsModel = {
  agent: { state: AgentState; haltCodes: string[] };
  asOf: string | null;
  limits: { capUnits: bigint; windowHours: number };
  plan: "fresh" | "stale" | "missing";
  autonomy: "ask" | "auto" | "unknown";
  threshold: bigint | null;
  dailyCap: bigint | null;
  salary: { proposed: bigint; day: number; payee: Address; payeeApproval: "none" | "waiting" | "effective"; payeeEffectiveAt: number } | null;
  cushion: { floorDays: number; targetDays: number } | null;
};

const dayNumber = (iso: string): number => Math.floor(Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10))) / 86_400_000);

export function settingsModel({ chain, plan, todayIso, now }: { chain: SettingsChain; plan: PlanNotice | null; todayIso: string; now: number }): SettingsModel {
  const { limits } = chain;
  const settings = plan?.settings;
  const codes = settings?.haltCodes ?? [];
  let state: AgentState = "running";
  if (limits.agent === zeroAddress) state = "none";
  else if (limits.paused) state = "paused";
  else if (settings?.halted) state = codes.length > 0 && codes.every((code) => code === "user-pause") ? "halted-user" : "halted-safety";

  const approval = settings ? chain.approvals[approvalKey(3, settings.payee as Address)] ?? null : null;
  const threshold = settings ? BigInt(settings.signatureThreshold) : null;
  return {
    agent: { state, haltCodes: state === "halted-safety" || state === "halted-user" ? codes : [] },
    asOf: plan?.asOf ?? null,
    limits: { capUnits: limits.cap, windowHours: Math.round(limits.windowSeconds / 3600) },
    plan: !plan ? "missing" : dayNumber(todayIso) - dayNumber(plan.asOf) > 2 ? "stale" : "fresh",
    autonomy: threshold === null ? "unknown" : threshold === 0n ? "ask" : "auto",
    threshold,
    dailyCap: settings ? BigInt(settings.dailyCap) : null,
    salary: settings ? { proposed: BigInt(settings.proposed), day: settings.day, payee: settings.payee as Address, payeeApproval: approvalState(approval, now), payeeEffectiveAt: approval?.effectiveAt ?? 0 } : null,
    cushion: settings ? { floorDays: settings.floorDays, targetDays: settings.targetDays } : null,
  };
}
