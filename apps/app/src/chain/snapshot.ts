import type { PlanNotice } from "@strickle/agent/notice-schema";
import { loadNoticeKey } from "../keys/notice-key.ts";
import type { Session } from "../account/session.ts";
import { type LogPage, fetchLogs } from "./logs.ts";
import { type Payment, paymentsFrom } from "./payments.ts";
import { latestPlan } from "./plan.ts";
import { type VaultState, readVault } from "./vault.ts";

export interface Snapshot {
  vault: VaultState;
  payments: Payment[];
  /** True when older payments exist that the explorer answer did not carry. */
  olderPayments: boolean;
  plan: PlanNotice | null;
  key: "present" | "missing";
  activity: "ok" | "unavailable";
  fetchedAt: number;
}

export type SnapshotScope = "home" | "boxes";

/** Home needs the plan; Boxes needs the plan and the payments. Each reads only what its screen shows. */
export async function loadSnapshot(session: Session, scope: SnapshotScope, signal?: AbortSignal): Promise<Snapshot> {
  const key = await loadNoticeKey(session.vault).catch(() => null);
  const empty: LogPage = { logs: [], truncated: false };
  const logs = Promise.all([
    scope === "boxes" ? fetchLogs("allocated", session.vault, signal) : empty,
    scope === "boxes" ? fetchLogs("split", session.vault, signal) : empty,
    key ? fetchLogs("notice", session.vault, signal) : empty,
  ]).then(
    (result) => ({ ok: true as const, result }),
    () => ({ ok: false as const }),
  );
  const [vault, fetched] = await Promise.all([readVault(session.vault), logs]);
  const base = { vault, key: key ? ("present" as const) : ("missing" as const), fetchedAt: Date.now() };
  if (!fetched.ok) return { ...base, payments: [], olderPayments: false, plan: null, activity: "unavailable" };
  const [allocated, splits, notices] = fetched.result;
  return {
    ...base,
    payments: paymentsFrom(allocated.logs, splits.logs),
    olderPayments: allocated.truncated,
    plan: key ? latestPlan(notices.logs, key, session.vault) : null,
    activity: "ok",
  };
}
