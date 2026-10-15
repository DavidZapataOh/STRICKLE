import type { BoxKind, CascadeState } from "@strickle/core";

export interface LiquidityPolicy {
  floorDays?: number;
  targetDays?: number;
  emergencyMonths?: 3 | 6 | 12;
}

export type OperatingLevel = "below-floor" | "building" | "at-target";

export interface OperatingStatus {
  floor: bigint;
  target: bigint;
  balance: bigint;
  floorGap: bigint;
  targetGap: bigint;
  /** Whole days of spend the balance covers; null when the spend is unknown (zero). */
  coverageDays: number | null;
  level: OperatingLevel;
}

export const DEFAULT_FLOOR_DAYS = 14;
export const DEFAULT_TARGET_DAYS = 42;
export const DAYS_PER_MONTH = 30;
const DEFAULT_EMERGENCY_MONTHS = 3;

const nonNegative = (value: bigint, name: string): void => {
  if (value < 0n) throw new RangeError(`${name} must not be negative`);
};

export function resolveLiquidityPolicy(policy: LiquidityPolicy = {}): { floorDays: number; targetDays: number; emergencyMonths: 3 | 6 | 12 } {
  const floorDays = policy.floorDays ?? DEFAULT_FLOOR_DAYS;
  const targetDays = policy.targetDays ?? DEFAULT_TARGET_DAYS;
  const emergencyMonths = policy.emergencyMonths ?? DEFAULT_EMERGENCY_MONTHS;
  for (const [name, days] of [["floorDays", floorDays], ["targetDays", targetDays]] as const) {
    if (!Number.isInteger(days) || days < 1) throw new RangeError(`${name} must be a positive integer, got ${days}`);
  }
  if (floorDays > targetDays) throw new RangeError("floorDays must not exceed targetDays");
  if (emergencyMonths !== 3 && emergencyMonths !== 6 && emergencyMonths !== 12) throw new RangeError(`emergencyMonths must be 3, 6 or 12, got ${emergencyMonths}`);
  return { floorDays, targetDays, emergencyMonths };
}

const atLeastZero = (value: bigint): bigint => (value > 0n ? value : 0n);

export function operatingStatus(balance: bigint, dailySpend: bigint, policy?: LiquidityPolicy): OperatingStatus {
  nonNegative(balance, "balance");
  nonNegative(dailySpend, "dailySpend");
  const { floorDays, targetDays } = resolveLiquidityPolicy(policy);
  const floor = BigInt(floorDays) * dailySpend;
  const target = BigInt(targetDays) * dailySpend;
  const level: OperatingLevel = balance < floor ? "below-floor" : balance < target ? "building" : "at-target";
  return {
    floor,
    target,
    balance,
    floorGap: atLeastZero(floor - balance),
    targetGap: atLeastZero(target - balance),
    coverageDays: dailySpend === 0n ? null : Number(balance / dailySpend),
    level,
  };
}

export function emergencyTarget(dailySpend: bigint, months: 3 | 6 | 12 = DEFAULT_EMERGENCY_MONTHS): bigint {
  nonNegative(dailySpend, "dailySpend");
  const { emergencyMonths } = resolveLiquidityPolicy({ emergencyMonths: months });
  return BigInt(DAYS_PER_MONTH * emergencyMonths) * dailySpend;
}

export const SOFT_LOCK_SECONDS = 86_400;

const smaller = (a: bigint, b: bigint): bigint => (a < b ? a : b);

/** Moves only what operating cash holds above its target into the fund, never more than the fund's gap. */
export function emergencySweep(input: { operatingBalance: bigint; dailySpend: bigint; emergencyBalance: bigint; policy?: LiquidityPolicy }): { toEmergency: bigint; operatingAfter: bigint; emergencyAfter: bigint } {
  nonNegative(input.emergencyBalance, "emergencyBalance");
  const status = operatingStatus(input.operatingBalance, input.dailySpend, input.policy);
  const { emergencyMonths } = resolveLiquidityPolicy(input.policy);
  const excess = atLeastZero(input.operatingBalance - status.target);
  const gap = atLeastZero(emergencyTarget(input.dailySpend, emergencyMonths) - input.emergencyBalance);
  const toEmergency = smaller(excess, gap);
  return { toEmergency, operatingAfter: input.operatingBalance - toEmergency, emergencyAfter: input.emergencyBalance + toEmergency };
}

/** The agent's internal routing rule: emergency money never funds the salary box. The owner can still withdraw after the soft lock. */
export function agentMayMoveEmergencyTo(destination: BoxKind): boolean {
  return destination !== "salary";
}

export function emergencyUnlockAt(requestedAtSeconds: number): number {
  if (!Number.isInteger(requestedAtSeconds) || requestedAtSeconds < 0) throw new RangeError("the time must be a non-negative integer of epoch seconds");
  return requestedAtSeconds + SOFT_LOCK_SECONDS;
}

/** The liquidity fields of the cascade's state, computed from the same rules as the status above. */
export function cascadeLiquidity(input: { dailySpend: bigint; operatingBalance: bigint; emergencyBalance: bigint; policy?: LiquidityPolicy }): Pick<CascadeState, "dailySpend" | "operatingBalance" | "floorDays" | "targetDays" | "emergencyTarget" | "emergencyBalance"> {
  nonNegative(input.operatingBalance, "operatingBalance");
  nonNegative(input.emergencyBalance, "emergencyBalance");
  const { floorDays, targetDays, emergencyMonths } = resolveLiquidityPolicy(input.policy);
  return {
    dailySpend: input.dailySpend,
    operatingBalance: input.operatingBalance,
    floorDays,
    targetDays,
    emergencyTarget: emergencyTarget(input.dailySpend, emergencyMonths),
    emergencyBalance: input.emergencyBalance,
  };
}
