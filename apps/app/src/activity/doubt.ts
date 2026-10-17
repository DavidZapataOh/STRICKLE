import type { Notice } from "@strickle/agent/notice-schema";
import type { DoubtFlag } from "@strickle/brain";
import type { Address } from "viem";

export interface Doubt {
  arrivalId: string;
  asset: "USDC" | "EURC";
  amount: bigint;
  flags: DoubtFlag[];
  sender: Address | null;
  answered: boolean;
}

/** The doubts the agent raised that nobody has answered yet, newest first: a correction that came after a doubt settles it, and so does the user's own acknowledgement. */
export function doubtsOf(notices: readonly Notice[], answeredIds: ReadonlySet<string>): Doubt[] {
  const doubts: Doubt[] = [];
  notices.forEach((notice, index) => {
    if (notice.kind !== "income-doubt" || answeredIds.has(notice.arrivalId)) return;
    const settled = notices.slice(index + 1).some((later) => later.kind === "reclassified" && later.arrivalId === notice.arrivalId);
    if (settled) return;
    doubts.push({ arrivalId: notice.arrivalId, asset: notice.asset, amount: BigInt(notice.amount), flags: notice.flags, sender: notice.sender === "" ? null : (notice.sender as Address), answered: false });
  });
  return doubts.reverse();
}

export interface Correction {
  arrivalId: string;
  amount: bigint;
  from: "income" | "own-transfer" | "refund";
  to: "income" | "own-transfer" | "refund";
}

/** The latest correction of each arrival, newest first. */
export function correctionsOf(notices: readonly Notice[]): Correction[] {
  const latest = new Map<string, Correction>();
  for (const notice of notices) {
    if (notice.kind === "reclassified") latest.set(notice.arrivalId, { arrivalId: notice.arrivalId, amount: BigInt(notice.amount), from: notice.from, to: notice.to });
  }
  return [...latest.values()].reverse();
}
