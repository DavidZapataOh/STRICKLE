export interface WithholdingResult {
    due: bigint;
    credit: bigint;
}
/** Applies the amounts already withheld to a liability; any excess is carried as a credit. */
export declare function applyWithholdings(liability: bigint, withheld: readonly bigint[]): WithholdingResult;
