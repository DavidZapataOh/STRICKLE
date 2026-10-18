import { type PlainDate } from "@strickle/core";
import { type Calendars } from "./calendar.ts";
/**
 * 5th percentile of the horizon return of a local-per-USD rate series, as the fall (in whole basis points,
 * rounded up) the local currency's rate suffers when it appreciates, never below `floorBps`.
 * `horizon` counts observations, not calendar days.
 */
export declare function adverseMoveBps(series: readonly number[], horizon: number, quantile?: number, floorBps?: number): number;
/** USDC base units needed to pay `liability` (local minor units) after the local currency appreciates by `adverseBps`. */
export declare function fxReserve({ liability, spot, adverseBps }: {
    liability: bigint;
    spot: string;
    adverseBps: number;
}): bigint;
export interface Tranche {
    date: PlainDate;
    amount: bigint;
}
/** Converts the reserve in even tranches from today up to the day before the due date. */
export declare function conversionSchedule({ today, dueDate, reserve, tranches }: {
    today: PlainDate;
    dueDate: PlainDate;
    reserve: bigint;
    tranches: number;
}): Tranche[];
export interface ReservePlan {
    due: bigint;
    credit: bigint;
    dueDate: PlainDate;
    adverseBps: number;
    reserve: bigint;
    schedule: Tranche[];
}
/** Liability net of withholdings, on its working-day due date, as a USD reserve with an adverse-move buffer and a conversion schedule. */
export declare function planReserve(args: {
    country: string;
    calendars: Calendars;
    today: PlainDate;
    nominalDue: PlainDate;
    liability: bigint;
    withheld: readonly bigint[];
    spot: string;
    series: readonly number[];
    tranches: number;
    /** Minimum cushion for currencies whose history understates the risk. */
    floorBps?: number;
}): ReservePlan;
