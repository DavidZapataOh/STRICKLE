import { BOX_KINDS, type BoxKind, type PlainDate, daysBetween } from "@strickle/core";
import { agentMayMoveEmergencyTo, emergencyUnlockAt } from "./operating-cash.ts";

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
  | { kind: "salary"; amount: bigint; signed?: boolean }
  | { kind: "swap"; box: BoxKind; amount: bigint; worstLoss: bigint };

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
    case "swap":
      // a conversion changes value only by what it can lose, so every invariant is judged at that worst case
      take(boxes[action.box], action.amount, "swap");
      take(action.amount, action.worstLoss, "swap (worst loss)");
      boxes[action.box] -= action.worstLoss;
      next.liquid -= action.worstLoss;
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

export interface InvariantPolicy {
  floorDays?: number;
  leadDays?: number;
  dailyCap: bigint;
  signatureThreshold: bigint;
}

export type InvariantCode = "books-balance" | "taxes-untouched" | "emergency-routing" | "payroll-funded" | "cushion-floor" | "daily-cap" | "signature-required";

export interface Violation {
  code: InvariantCode;
  gap: bigint;
  detail: string;
}

const atLeastZero = (value: bigint): bigint => (value > 0n ? value : 0n);
const sumBoxes = (s: Snapshot): bigint => BOX_KINDS.reduce((sum, box) => sum + s.boxes[box], 0n) + s.unallocated;

function resolve(policy: InvariantPolicy): { floorDays: bigint; leadDays: number; dailyCap: bigint; signatureThreshold: bigint } {
  const floorDays = policy.floorDays ?? 14;
  const leadDays = policy.leadDays ?? 2;
  if (!Number.isInteger(floorDays) || floorDays < 1) throw new RangeError("floorDays must be a positive integer");
  if (!Number.isInteger(leadDays) || leadDays < 0) throw new RangeError("leadDays must be a non-negative integer");
  if (policy.dailyCap < 0n || policy.signatureThreshold < 0n) throw new RangeError("the daily cap and the signature threshold must not be negative");
  return { floorDays: BigInt(floorDays), leadDays, dailyCap: policy.dailyCap, signatureThreshold: policy.signatureThreshold };
}

/** What the payroll box must hold: every payroll due within `leadDays` days (or already past due). */
const payrollRequired = (s: Snapshot, leadDays: number): bigint => s.payrolls.filter((payroll) => daysBetween(s.asOf, payroll.due) <= leadDays).reduce((sum, payroll) => sum + payroll.amount, 0n);

/** The payroll due soon must be covered by its box and by cash that is actually liquid (not parked in a yield vault). */
const payrollGap = (s: Snapshot, leadDays: number): bigint => atLeastZero(payrollRequired(s, leadDays) - (s.boxes.payroll < s.liquid ? s.boxes.payroll : s.liquid));
const cushionGap = (s: Snapshot, floorDays: bigint): bigint => atLeastZero(floorDays * s.dailySpend - s.boxes.operating);
const capGap = (s: Snapshot, cap: bigint): bigint => atLeastZero(s.outflowsToday - cap);

/**
 * The violations an action introduces or worsens, in the fixed order. Books, taxes and signature are judged on the action itself;
 * payroll, cushion and cap compare the shortfall after with the shortfall before, so an account that starts short is not halted by an action that does not deepen it.
 */
export function evaluate(before: Snapshot, after: Snapshot, policy: InvariantPolicy, action: Action): Violation[] {
  const p = resolve(policy);
  const found: Violation[] = [];

  const mismatch = sumBoxes(after) - (after.liquid + after.inVaults);
  if (mismatch !== 0n) found.push({ code: "books-balance", gap: mismatch < 0n ? -mismatch : mismatch, detail: "the boxes do not add up to the liquid and vault balances" });

  const settledTax = action.kind === "pay" && action.settles?.kind === "tax" ? action.amount : 0n;
  const taxesDebited = atLeastZero(before.boxes.taxes - after.boxes.taxes - settledTax);
  if (taxesDebited > 0n) found.push({ code: "taxes-untouched", gap: taxesDebited, detail: "the taxes box was debited outside a settlement to an approved authority" });

  if (action.kind === "move" && action.from === "emergency") {
    const lockOpen = action.ownerRequest !== undefined && action.ownerRequest.now >= emergencyUnlockAt(action.ownerRequest.requestedAt);
    if (!agentMayMoveEmergencyTo(action.to) || !lockOpen) found.push({ code: "emergency-routing", gap: action.amount, detail: "emergency money never funds the salary box and leaves only on an owner request past the 24-hour soft lock" });
  }

  const relative: [InvariantCode, bigint, bigint, string][] = [
    ["payroll-funded", payrollGap(before, p.leadDays), payrollGap(after, p.leadDays), "the payroll due soon is not fully funded"],
    ["cushion-floor", cushionGap(before, p.floorDays), cushionGap(after, p.floorDays), "the operating cash is below the floor"],
    ["daily-cap", capGap(before, p.dailyCap), capGap(after, p.dailyCap), "today's outflows exceed the daily cap"],
  ];
  for (const [code, was, now, detail] of relative) if (now > was) found.push({ code, gap: now, detail });

  const outflow = action.kind === "pay" || action.kind === "salary" ? action.amount : 0n;
  const signed = (action.kind === "pay" || action.kind === "salary") && action.signed === true;
  if (outflow > p.signatureThreshold && !signed) found.push({ code: "signature-required", gap: outflow - p.signatureThreshold, detail: "an outflow above the threshold needs a human signature" });

  const order: InvariantCode[] = ["books-balance", "taxes-untouched", "emergency-routing", "payroll-funded", "cushion-floor", "daily-cap", "signature-required"];
  return found.sort((a, b) => order.indexOf(a.code) - order.indexOf(b.code));
}
