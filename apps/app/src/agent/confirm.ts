import type { Address } from "viem";
import { fetchLogsFrom } from "../chain/logs.ts";
import type { NoticeKey } from "../keys/notice-key.ts";
import { decodeActivity } from "../activity/events.ts";
import { type OpenedNotice, openNotices } from "../activity/timeline.ts";

export const decisionSeen = (args: { notices: OpenedNotice[]; proposalId: string; status: "executed" | "rejected" }): boolean =>
  args.notices.some((item) => item.notice?.kind === "decision" && item.notice.proposalId === args.proposalId && item.notice.status === args.status);

// Only a decision notice confirms an action. A salary payment would not: the daily tick also pays salaries by itself.
export async function confirmDecision(args: { vault: Address; key: NoticeKey | null; proposalId: string; status: "executed" | "rejected"; sinceBlock: bigint; signal?: AbortSignal }): Promise<boolean> {
  if (!args.key) return false;
  const { logs } = await fetchLogsFrom("notice", args.vault, { fromBlock: args.sinceBlock, signal: args.signal });
  const { notices } = decodeActivity({ executor: [], allocated: [], spent: new Map(), state: logs });
  return decisionSeen({ notices: openNotices(notices, args.vault, args.key), proposalId: args.proposalId, status: args.status });
}
