export class AssetMismatchError extends Error {
    constructor(left, right) {
        super(`cannot combine ${left} with ${right}`);
        this.name = "AssetMismatchError";
    }
}
export const money = (asset, units) => ({ asset, units });
function assertSameAsset(a, b) {
    if (a.asset !== b.asset)
        throw new AssetMismatchError(a.asset, b.asset);
}
export function add(a, b) {
    assertSameAsset(a, b);
    return money(a.asset, a.units + b.units);
}
export function sub(a, b) {
    assertSameAsset(a, b);
    return money(a.asset, a.units - b.units);
}
export function compare(a, b) {
    assertSameAsset(a, b);
    return a.units < b.units ? -1 : a.units > b.units ? 1 : 0;
}
export function sum(asset, items) {
    return items.reduce(add, money(asset, 0n));
}
