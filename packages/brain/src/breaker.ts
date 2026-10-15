import type { PlainDate } from "@strickle/core";
import { type Action, type InvariantPolicy, type Snapshot, type Violation, evaluate, predict } from "./invariants.ts";

export type BreakerState = { status: "running" } | { status: "halted"; since: PlainDate; violations: Violation[] };

export type Guard =
  | { allow: true }
  | { allow: false; reason: "halted" }
  | { allow: false; reason: "invalid-action"; message: string }
  | { allow: false; reason: "violations"; violations: Violation[] };

/** Before executing: refuse an action whose predicted result would break an invariant. */
export function guard(state: BreakerState, snapshot: Snapshot, action: Action, policy: InvariantPolicy): Guard {
  if (state.status === "halted") return { allow: false, reason: "halted" };
  let predicted: Snapshot;
  try {
    predicted = predict(snapshot, action);
  } catch (error) {
    if (error instanceof RangeError) return { allow: false, reason: "invalid-action", message: error.message };
    throw error;
  }
  const violations = evaluate(snapshot, predicted, policy, action);
  return violations.length === 0 ? { allow: true } : { allow: false, reason: "violations", violations };
}

/** After executing: halt on any real result that introduces or worsens a violation. A halted breaker never changes by itself. */
export function observe(state: BreakerState, before: Snapshot, after: Snapshot, action: Action, policy: InvariantPolicy): BreakerState {
  if (state.status === "halted") return state;
  const violations = evaluate(before, after, policy, action);
  return violations.length === 0 ? state : { status: "halted", since: after.asOf, violations };
}

export function reset(state: BreakerState, actor: string, at: PlainDate): { state: BreakerState; audit: { actor: string; at: PlainDate; cleared: Violation[] } } {
  if (actor.trim() === "") throw new RangeError("a reset needs the name of the person who acknowledges it");
  if (state.status === "running") throw new RangeError("the breaker is running: there is nothing to reset");
  return { state: { status: "running" }, audit: { actor, at, cleared: state.violations } };
}
