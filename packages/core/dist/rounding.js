import { money } from "./money.js";
export function mulDiv(a, b, d, mode) {
    if (a < 0n || b < 0n || d <= 0n) {
        throw new RangeError("mulDiv needs non-negative factors and a positive divisor");
    }
    const product = a * b;
    const quotient = product / d;
    const remainder = product % d;
    if (remainder === 0n)
        return quotient;
    if (mode === "floor")
        return quotient;
    if (mode === "ceil")
        return quotient + 1n;
    const twice = 2n * remainder;
    if (twice > d)
        return quotient + 1n;
    if (twice < d)
        return quotient;
    return quotient % 2n === 0n ? quotient : quotient + 1n;
}
export function portion(total, numerator, denominator, mode) {
    if (numerator > denominator)
        throw new RangeError("a portion cannot exceed the whole");
    const part = money(total.asset, mulDiv(total.units, numerator, denominator, mode));
    return { part, rest: money(total.asset, total.units - part.units) };
}
