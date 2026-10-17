import { evaluate, predict } from "@strickle/brain";
import type { PlainDate } from "@strickle/core";
import type { Profile } from "./profile.ts";
import { type TickBooks, invariantPolicy, snapshotOf } from "./tick.ts";

/** The brain's invariants judge the move before anything is asked of Circle; the vault enforces its own bounds regardless. A move the brain cannot even model is not allowed. */
export function earnAllowed(profile: Profile, books: TickBooks, today: PlainDate, move: { deposit: boolean; box: string; amount: bigint }): boolean {
  const action = move.deposit ? ({ kind: "sweep", amount: move.amount } as const) : ({ kind: "redeem", amount: move.amount } as const);
  try {
    const before = snapshotOf(profile, books, today);
    return evaluate(before, predict(before, action), invariantPolicy(profile), action).length === 0;
  } catch {
    return false;
  }
}
