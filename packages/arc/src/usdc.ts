import { parseUnits } from "viem";

const DECIMAL = /^[0-9]+(\.[0-9]{1,6})?$/;

export function usdcFromDollars(value: string, label: string): bigint {
  if (!DECIMAL.test(value)) throw new Error(`${label} must be a decimal number of dollars with at most six decimals`);
  const units = parseUnits(value, 6);
  if (units === 0n) throw new Error(`${label} must be above zero`);
  return units;
}
