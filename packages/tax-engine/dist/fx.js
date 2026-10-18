import { addDays, daysBetween } from "@strickle/core";
import { nextBusinessDay } from "./calendar.js";
import { applyWithholdings } from "./withholdings.js";
const RATE_SCALE = 8;
/**
 * 5th percentile of the horizon return of a local-per-USD rate series, as the fall (in whole basis points,
 * rounded up) the local currency's rate suffers when it appreciates, never below `floorBps`.
 * `horizon` counts observations, not calendar days.
 */
export function adverseMoveBps(series, horizon, quantile = 0.05, floorBps = 0) {
    if (!Number.isInteger(horizon) || horizon < 1)
        throw new RangeError("horizon must be a positive integer");
    if (series.some((rate) => !(rate > 0)))
        throw new RangeError("rates must be positive");
    const samples = series.length - horizon;
    if (samples < 20)
        throw new RangeError("the series is too short for this horizon");
    const returns = [];
    for (let t = 0; t < samples; t++)
        returns.push(series[t + horizon] / series[t]);
    returns.sort((a, b) => a - b);
    const worst = returns[Math.max(0, Math.ceil(quantile * returns.length) - 1)];
    return Math.max(floorBps, Math.ceil((1 - worst) * 10_000));
}
function parseRate(text) {
    const match = /^(\d+)(?:\.(\d{1,8}))?$/.exec(text);
    const rate = match ? BigInt(match[1]) * 10n ** BigInt(RATE_SCALE) + BigInt((match[2] ?? "").padEnd(RATE_SCALE, "0") || "0") : 0n;
    if (rate <= 0n)
        throw new RangeError(`not a positive rate: "${text}"`);
    return rate;
}
/** USDC base units needed to pay `liability` (local minor units) after the local currency appreciates by `adverseBps`. */
export function fxReserve({ liability, spot, adverseBps }) {
    if (liability < 0n)
        throw new RangeError("liability must not be negative");
    if (!Number.isInteger(adverseBps) || adverseBps < 0 || adverseBps >= 10_000)
        throw new RangeError("adverseBps must be an integer from 0 to 9999");
    const rate = parseRate(spot);
    const numerator = liability * 10n ** 4n * 10n ** BigInt(RATE_SCALE) * 10000n;
    const denominator = rate * BigInt(10_000 - adverseBps);
    return (numerator + denominator - 1n) / denominator;
}
/** Converts the reserve in even tranches from today up to the day before the due date. */
export function conversionSchedule({ today, dueDate, reserve, tranches }) {
    const daysLeft = daysBetween(today, dueDate);
    if (daysLeft < 0)
        throw new RangeError("the due date is in the past");
    if (!Number.isInteger(tranches) || tranches < 1)
        throw new RangeError("tranches must be a positive integer");
    if (reserve <= 0n)
        return [];
    const count = Math.max(1, Math.min(tranches, daysLeft));
    const base = reserve / BigInt(count);
    return Array.from({ length: count }, (_, i) => ({
        date: count === 1 ? today : addDays(today, Math.floor((i * (daysLeft - 1)) / (count - 1))),
        amount: i === count - 1 ? reserve - base * BigInt(count - 1) : base,
    }));
}
/** Liability net of withholdings, on its working-day due date, as a USD reserve with an adverse-move buffer and a conversion schedule. */
export function planReserve(args) {
    const { due, credit } = applyWithholdings(args.liability, args.withheld);
    const dueDate = nextBusinessDay(args.calendars, args.country, args.nominalDue);
    const horizon = Math.max(1, Math.ceil((daysBetween(args.today, dueDate) * 5) / 7));
    const adverseBps = due === 0n ? 0 : adverseMoveBps(args.series, horizon, 0.05, args.floorBps ?? 0);
    const reserve = fxReserve({ liability: due, spot: args.spot, adverseBps });
    return { due, credit, dueDate, adverseBps, reserve, schedule: conversionSchedule({ today: args.today, dueDate, reserve, tranches: args.tranches }) };
}
