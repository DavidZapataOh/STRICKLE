/** Applies the amounts already withheld to a liability; any excess is carried as a credit. */
export function applyWithholdings(liability, withheld) {
    if (liability < 0n || withheld.some((amount) => amount < 0n))
        throw new RangeError("amounts must not be negative");
    const total = withheld.reduce((sum, amount) => sum + amount, 0n);
    return total >= liability ? { due: 0n, credit: total - liability } : { due: liability - total, credit: 0n };
}
