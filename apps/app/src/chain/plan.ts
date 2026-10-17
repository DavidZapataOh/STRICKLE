import { type Notice, type PlanNotice, noticeSchema } from "@strickle/agent/notice-schema";
import { openNotice } from "@strickle/agent/notices";
import { type Address, type Hex, decodeEventLog, hexToBytes } from "viem";
import type { NoticeKey } from "../keys/notice-key.ts";
import type { RawLog } from "./logs.ts";
import { events } from "./read-abi.ts";

const WINDOW = 12;

const byIdDescending = <T extends { id: bigint }>(a: T, b: T) => (a.id < b.id ? 1 : a.id > b.id ? -1 : 0);

/** Every notice this key can open for this vault and that matches the schema, newest first. A notice that does not open is not ours to show. */
export function openedNotices(logs: RawLog[], key: NoticeKey, vault: Address): { id: bigint; notice: Notice }[] {
  const decoded = logs.flatMap((log) => {
    try {
      const { args } = decodeEventLog({ abi: [events.notice], data: log.data, topics: log.topics as [Hex, ...Hex[]] });
      return [{ id: args.id, sealed: hexToBytes(args.sealedData) }];
    } catch {
      return [];
    }
  });
  const opened: { id: bigint; notice: Notice }[] = [];
  for (const { id, sealed } of decoded.sort(byIdDescending)) {
    try {
      const parsed = noticeSchema.safeParse(openNotice(key.secret, key.publicKey, vault, id, sealed));
      if (parsed.success) opened.push({ id, notice: parsed.data });
    } catch {
      // sealed for someone else, or damaged
    }
  }
  return opened;
}

/** Looks at the twelve newest notices only: a plan older than that is not a plan worth reading. */
export function latestPlan(logs: RawLog[], key: NoticeKey, vault: Address): PlanNotice | null {
  const newest = logs
    .map((log) => ({ log, id: log.topics[2] ? BigInt(log.topics[2]) : 0n }))
    .sort(byIdDescending)
    .slice(0, WINDOW)
    .map((entry) => entry.log);
  const found = openedNotices(newest, key, vault).find((entry) => entry.notice.kind === "plan");
  return found && found.notice.kind === "plan" ? found.notice : null;
}

export type HeldNotice = Extract<Notice, { kind: "swap-held" }>["reason"];

/** Why conversions are paused right now: the newest conversion notice among the twelve newest is a pause, not a conversion that went through. */
export function latestHeld(logs: RawLog[], key: NoticeKey, vault: Address): HeldNotice | undefined {
  const newest = logs
    .map((log) => ({ log, id: log.topics[2] ? BigInt(log.topics[2]) : 0n }))
    .sort(byIdDescending)
    .slice(0, WINDOW)
    .map((entry) => entry.log);
  const latest = openedNotices(newest, key, vault).find((entry) => entry.notice.kind === "swap" || entry.notice.kind === "swap-held");
  return latest && latest.notice.kind === "swap-held" ? latest.notice.reason : undefined;
}
