import type { Asset } from "./asset.ts";
import { BOX_KINDS, type BoxKind } from "./box.ts";
import { AssetMismatchError, type Money, money } from "./money.ts";
import { mulDiv } from "./rounding.ts";

export type CascadeReason =
  | "tax-reserve"
  | "payroll-gap"
  | "liquidity-floor"
  | "salary-owed"
  | "liquidity-target"
  | "emergency-deficit"
  | "remainder";

export interface CascadeState {
  asset: Asset;
  /** Share of each payment reserved for taxes, in basis points of the payment (2,000 = 20 %). */
  taxRateBps: number;
  /** 10,500 to 11,000: the small surplus that is later returned as a refund. */
  taxBufferBps: number;
  /** What is still unreserved of the tax liability, already including the buffer; caps the reserve. */
  taxLiabilityRemaining?: bigint;
  /** An additional tax reserve this payment owes on top of its own rate (a correction that turned own money into income); still capped by the liability left and by the payment. */
  taxExtra?: bigint;
  /** What the payroll and bills due in the next 30 days will cost (P90) and what is already set aside. */
  payrollDue: bigint;
  payrollFunded: bigint;
  /** Share of the payroll gap to fund from this payment, in basis points (default 10,000). */
  payrollShareBps?: number;
  dailySpend: bigint;
  operatingBalance: bigint;
  /** Days of expenses that are a hard floor (default 14) and the target (default 42). */
  floorDays?: number;
  targetDays?: number;
  /** This period's salary plus any amount still pending from before. */
  salaryOwed: bigint;
  emergencyTarget: bigint;
  emergencyBalance: bigint;
}

export interface CascadeLine {
  box: BoxKind;
  reason: CascadeReason;
  amount: Money;
  need: Money;
  met: boolean;
}

export interface CascadeResult {
  lines: CascadeLine[];
  byBox: Record<BoxKind, Money>;
  salaryPending: Money;
}

type Need = Exclude<CascadeReason, "remainder">;

const TIERS: readonly { reason: Need; box: BoxKind }[] = [
  { reason: "tax-reserve", box: "taxes" },
  { reason: "payroll-gap", box: "payroll" },
  { reason: "liquidity-floor", box: "operating" },
  { reason: "salary-owed", box: "salary" },
  { reason: "liquidity-target", box: "operating" },
  { reason: "emergency-deficit", box: "emergency" },
];

const MIN_BUFFER = 10_500;
const MAX_BUFFER = 11_000;
const BPS = 10_000n;

const positive = (value: bigint, name: string): void => {
  if (value < 0n) throw new RangeError(`${name} cannot be negative`);
};
const basisPoints = (value: number, name: string, min = 0, max = 10_000): void => {
  if (!Number.isInteger(value) || value < min || value > max) throw new RangeError(`${name} must be an integer between ${min} and ${max}`);
};
const atLeastZero = (value: bigint): bigint => (value > 0n ? value : 0n);

function validate(payment: Money, state: CascadeState): { floorDays: bigint; targetDays: bigint; payrollShareBps: bigint } {
  if (payment.asset !== state.asset) throw new AssetMismatchError(payment.asset, state.asset);
  positive(payment.units, "payment");
  basisPoints(state.taxRateBps, "taxRateBps");
  basisPoints(state.taxBufferBps, "taxBufferBps", MIN_BUFFER, MAX_BUFFER);
  const payrollShare = state.payrollShareBps ?? 10_000;
  basisPoints(payrollShare, "payrollShareBps");
  const floorDays = state.floorDays ?? 14;
  const targetDays = state.targetDays ?? 42;
  basisPoints(floorDays, "floorDays", 0, 3_650);
  basisPoints(targetDays, "targetDays", floorDays, 3_650);
  for (const [name, value] of Object.entries({
    payrollDue: state.payrollDue,
    payrollFunded: state.payrollFunded,
    dailySpend: state.dailySpend,
    operatingBalance: state.operatingBalance,
    salaryOwed: state.salaryOwed,
    emergencyTarget: state.emergencyTarget,
    emergencyBalance: state.emergencyBalance,
    ...(state.taxLiabilityRemaining === undefined ? {} : { taxLiabilityRemaining: state.taxLiabilityRemaining }),
    ...(state.taxExtra === undefined ? {} : { taxExtra: state.taxExtra }),
  })) {
    positive(value, name);
  }
  return { floorDays: BigInt(floorDays), targetDays: BigInt(targetDays), payrollShareBps: BigInt(payrollShare) };
}

/** What each obligation needs from this payment, before any priority is applied. */
export function computeNeeds(payment: Money, state: CascadeState): Record<Need, bigint> {
  const { floorDays, targetDays, payrollShareBps } = validate(payment, state);
  const taxFactor = BigInt(state.taxRateBps) * BigInt(state.taxBufferBps);
  const taxReserve = mulDiv(payment.units, taxFactor, BPS * BPS, "ceil") + (state.taxExtra ?? 0n);
  const floorDeficit = atLeastZero(floorDays * state.dailySpend - state.operatingBalance);
  const targetDeficit = atLeastZero(targetDays * state.dailySpend - state.operatingBalance);
  return {
    "tax-reserve": state.taxLiabilityRemaining === undefined || taxReserve < state.taxLiabilityRemaining ? taxReserve : state.taxLiabilityRemaining,
    "payroll-gap": mulDiv(atLeastZero(state.payrollDue - state.payrollFunded), payrollShareBps, BPS, "ceil"),
    "liquidity-floor": floorDeficit,
    "salary-owed": state.salaryOwed,
    "liquidity-target": targetDeficit - floorDeficit,
    "emergency-deficit": atLeastZero(state.emergencyTarget - state.emergencyBalance),
  };
}

/**
 * Turns a payment into per-box amounts by obligation priority: taxes, payroll, the operating floor, the
 * salary, the operating target, the emergency fund, and whatever is left to profit. The percentages are
 * the output of this walk, never an input.
 */
export function allocatePayment(payment: Money, state: CascadeState): CascadeResult {
  const needs = computeNeeds(payment, state);
  let remaining = payment.units;
  const lines: CascadeLine[] = [];
  for (const { reason, box } of TIERS) {
    const need = needs[reason];
    const given = need < remaining ? need : remaining;
    remaining -= given;
    lines.push({ box, reason, amount: money(payment.asset, given), need: money(payment.asset, need), met: given === need });
  }
  lines.push({ box: "profit", reason: "remainder", amount: money(payment.asset, remaining), need: money(payment.asset, 0n), met: true });

  const byBox = Object.fromEntries(BOX_KINDS.map((box) => [box, money(payment.asset, 0n)])) as Record<BoxKind, Money>;
  for (const line of lines) byBox[line.box] = money(payment.asset, byBox[line.box].units + line.amount.units);
  const salaryGiven = lines.find((line) => line.reason === "salary-owed")?.amount.units ?? 0n;
  return { lines, byBox, salaryPending: money(payment.asset, state.salaryOwed - salaryGiven) };
}
