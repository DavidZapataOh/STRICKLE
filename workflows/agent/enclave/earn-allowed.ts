import { evaluate, predict } from "@strickle/brain";
import type { PlainDate } from "@strickle/core";
import type { Profile } from "./profile.ts";
import { type TickBooks, invariantPolicy, snapshotOf } from "./tick.ts";

/**
 * The brain's invariants judge a deposit before anything is asked of Circle; the vault enforces its own bounds regardless. A move the brain cannot even model is not allowed.
 * Taking money back is always allowed: it only turns invested money into cash, and a position that has earned is worth more than the principal the books show, so judging it as a move of that size would refuse exactly the withdrawals people need.
 */
export function earnAllowed(profile: Profile, books: TickBooks, today: PlainDate, move: { deposit: boolean; box: string; amount: bigint }): boolean {
  if (!move.deposit) return true;
  const action = { kind: "sweep", amount: move.amount } as const;
  try {
    const before = snapshotOf(profile, books, today);
    return evaluate(before, predict(before, action), invariantPolicy(profile), action).length === 0;
  } catch {
    return false;
  }
}
