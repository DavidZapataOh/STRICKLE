import type { Asset } from "./asset.ts";
import { type BoxKind } from "./box.ts";
import { type Money } from "./money.ts";
export type CascadeReason = "tax-reserve" | "payroll-gap" | "liquidity-floor" | "salary-owed" | "liquidity-target" | "emergency-deficit" | "remainder";
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
/** What each obligation needs from this payment, before any priority is applied. */
export declare function computeNeeds(payment: Money, state: CascadeState): Record<Need, bigint>;
/**
 * Turns a payment into per-box amounts by obligation priority: taxes, payroll, the operating floor, the
 * salary, the operating target, the emergency fund, and whatever is left to profit. The percentages are
 * the output of this walk, never an input.
 */
export declare function allocatePayment(payment: Money, state: CascadeState): CascadeResult;
export {};
