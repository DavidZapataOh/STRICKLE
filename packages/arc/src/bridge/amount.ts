import { formatUnits } from "viem";

/** The kit takes a decimal string: never a float, which would lose cents. */
export const formatAmount = (units: bigint): string => formatUnits(units, 6);
