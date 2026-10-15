import { BOX_KINDS, type BoxKind, type PlainDate, daysBetween } from "@strickle/core";

export interface Snapshot {
  asOf: PlainDate;
  boxes: Record<BoxKind, bigint>;
  unallocated: bigint;
  liquid: bigint;
  inVaults: bigint;
  taxesReserved: bigint;
  payrolls: readonly { due: PlainDate; amount: bigint }[];
  dailySpend: bigint;
  outflowsToday: bigint;
}

export type Action =
  | { kind: "split"; amounts: Partial<Record<BoxKind, bigint>> }
  | { kind: "move"; from: BoxKind; to: BoxKind; amount: bigint; ownerRequest?: { requestedAt: number; now: number } }
  | { kind: "pay"; from: BoxKind; amount: bigint; settles?: { kind: "payroll"; due: PlainDate } | { kind: "tax" }; signed?: boolean }
  | { kind: "sweep"; amount: bigint }
  | { kind: "redeem"; amount: bigint }
  | { kind: "salary"; amount: bigint; signed?: boolean };

const sameDay = (a: PlainDate, b: PlainDate) => daysBetween(a, b) === 0;

function take(available: bigint, amount: bigint, what: string): void {
  if (amount < 0n) throw new RangeError(`${what}: the amount must not be negative`);
  if (amount > available) throw new RangeError(`${what}: ${amount} exceeds the ${available} available`);
}

/** Applies an action to a snapshot without side effects; throws on an impossible action. */
export function predict(snapshot: Snapshot, action: Action): Snapshot {
  const boxes = { ...snapshot.boxes };
  const next: Snapshot = { ...snapshot, boxes };
  switch (action.kind) {
    case "split": {
      const amounts = Object.entries(action.amounts) as [BoxKind, bigint][];
      const sum = amounts.reduce((acc, [, amount]) => acc + amount, 0n);
      take(snapshot.unallocated, sum, "split");
      for (const [box, amount] of amounts) {
        if (amount < 0n) throw new RangeError("split: the amount must not be negative");
        boxes[box] += amount;
      }
      next.unallocated -= sum;
      break;
    }
    case "move":
      take(boxes[action.from], action.amount, "move");
      boxes[action.from] -= action.amount;
      boxes[action.to] += action.amount;
      break;
    case "pay": {
      take(boxes[action.from], action.amount, "pay");
      take(snapshot.liquid, action.amount, "pay (liquid cash)");
      boxes[action.from] -= action.amount;
      next.liquid -= action.amount;
      next.outflowsToday += action.amount;
      if (action.settles?.kind === "payroll") {
        const due = action.settles.due;
        const index = snapshot.payrolls.findIndex((payroll) => sameDay(payroll.due, due));
        if (index < 0) throw new RangeError("pay: there is no payroll due on that date to settle");
        next.payrolls = snapshot.payrolls.filter((_, i) => i !== index);
      }
      break;
    }
    case "sweep":
      take(snapshot.liquid, action.amount, "sweep");
      next.liquid -= action.amount;
      next.inVaults += action.amount;
      break;
    case "redeem":
      take(snapshot.inVaults, action.amount, "redeem");
      next.inVaults -= action.amount;
      next.liquid += action.amount;
      break;
    case "salary":
      take(boxes.salary, action.amount, "salary");
      take(snapshot.liquid, action.amount, "salary (liquid cash)");
      boxes.salary -= action.amount;
      next.liquid -= action.amount;
      next.outflowsToday += action.amount;
      break;
  }
  return next;
}

export { BOX_KINDS };
