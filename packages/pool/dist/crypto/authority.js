import { randomBytes } from "@noble/hashes/utils.js";
import { Point, ORDER, scalarFromBytes } from "./keys.js";
const Fn = Point.Fn;
const mod = (value) => ((value % ORDER) + ORDER) % ORDER;
/** Trusted-dealer Shamir sharing of the authority's view secret over the ristretto255 scalar field. */
export function dealAuthority(threshold, shares) {
    if (!Number.isInteger(threshold) || !Number.isInteger(shares) || threshold < 2 || threshold > shares || shares > 255) {
        throw new RangeError("need 2 <= threshold <= shares <= 255");
    }
    const coefficients = Array.from({ length: threshold }, () => scalarFromBytes(randomBytes(64)));
    const evaluate = (x) => coefficients.reduceRight((acc, coefficient) => mod(acc * BigInt(x) + coefficient), 0n);
    return {
        publicKey: Point.BASE.multiply(coefficients[0]).toBytes(),
        shares: Array.from({ length: shares }, (_, i) => ({ index: i + 1, value: evaluate(i + 1) })),
    };
}
/** One holder's contribution to the Diffie-Hellman result; the share itself never leaves the holder. */
export function partialDecrypt(epk, share) {
    return { index: share.index, point: Point.fromBytes(epk).multiply(share.value).toBytes() };
}
function lagrangeAtZero(indexes, index) {
    let numerator = 1n;
    let denominator = 1n;
    for (const other of indexes) {
        if (other === index)
            continue;
        numerator = mod(numerator * BigInt(other));
        denominator = mod(denominator * mod(BigInt(other) - BigInt(index)));
    }
    return mod(numerator * Fn.inv(denominator));
}
/** Combines partial results in the exponent: the group secret is never reassembled. */
export function combinePartials(partials) {
    if (partials.length === 0)
        throw new RangeError("need at least one partial result");
    const indexes = partials.map((partial) => partial.index);
    if (new Set(indexes).size !== indexes.length)
        throw new RangeError("duplicate share index");
    const total = partials.reduce((sum, partial) => sum.add(Point.fromBytes(partial.point).multiply(lagrangeAtZero(indexes, partial.index))), Point.ZERO);
    return total.toBytes();
}
