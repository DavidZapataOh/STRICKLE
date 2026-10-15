import { type Action, type InvariantPolicy, type Snapshot, type Violation, evaluate, predict } from "./invariants.ts";
import { emergencyUnlockAt } from "./operating-cash.ts";
import type { Receipt } from "./receipt.ts";

export type UndoStep =
  | { kind: "sweep"; amount: bigint }
  | { kind: "redeem"; amount: bigint }
  | { kind: "move"; from: "emergency"; to: "operating"; amount: bigint }
  | { kind: "restore-rate"; bps: number }
  | { kind: "cancel-proposal" };

export type UndoPlan = { undoable: true; steps: UndoStep[]; waitsUntil?: number } | { undoable: false; reason: string; violations?: Violation[] };

function amountOf(receipt: Receipt): bigint {
  const fact = receipt.facts.values.amount;
  if (!fact || fact.type !== "amount") throw new RangeError(`${receipt.kind}: the receipt has no amount to reverse`);
  return fact.units;
}

/** Turns the receipt's reversibility into concrete steps and checks each one on the books before offering it. */
export function undoPlan(receipt: Receipt, state: { snapshot: Snapshot; now: number; undone: ReadonlySet<string> }, policy: InvariantPolicy): UndoPlan {
  if (state.undone.has(receipt.id)) return { undoable: false, reason: "this receipt was already undone" };
  if (!receipt.undo.undoable) return { undoable: false, reason: receipt.undo.reason };

  let steps: UndoStep[];
  let waitsUntil: number | undefined;
  switch (receipt.undo.how) {
    case "redeem":
      steps = [{ kind: "redeem", amount: amountOf(receipt) }];
      break;
    case "sweep":
      steps = [{ kind: "sweep", amount: amountOf(receipt) }];
      break;
    case "move-back":
      steps = [{ kind: "move", from: "emergency", to: "operating", amount: amountOf(receipt) }];
      waitsUntil = emergencyUnlockAt(state.now);
      break;
    case "restore-rate": {
      const from = receipt.facts.values.from;
      if (!from || from.type !== "bps") throw new RangeError("taxes-recompute: the receipt has no previous rate");
      steps = [{ kind: "restore-rate", bps: from.value }];
      break;
    }
    case "cancel-proposal":
      steps = [{ kind: "cancel-proposal" }];
      break;
  }

  let snapshot = state.snapshot;
  for (const step of steps) {
    if (step.kind === "restore-rate" || step.kind === "cancel-proposal") continue;
    const action: Action = step.kind === "move"
      ? { kind: "move", from: step.from, to: step.to, amount: step.amount, ownerRequest: { requestedAt: state.now, now: waitsUntil ?? state.now } }
      : { kind: step.kind, amount: step.amount };
    let after: Snapshot;
    try {
      after = predict(snapshot, action);
    } catch (error) {
      if (error instanceof RangeError) return { undoable: false, reason: error.message };
      throw error;
    }
    const violations = evaluate(snapshot, after, policy, action);
    if (violations.length > 0) return { undoable: false, reason: "undoing it would break a safety rule", violations };
    snapshot = after;
  }
  return waitsUntil === undefined ? { undoable: true, steps } : { undoable: true, steps, waitsUntil };
}
