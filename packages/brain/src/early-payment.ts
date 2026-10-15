const integer = (value: number, min: number, max: number, name: string): void => {
  if (!Number.isInteger(value) || value < min || value > max) throw new RangeError(`${name} must be an integer from ${min} to ${max}, got ${value}`);
};

/** APR = d / (1 - d) x 365 / days gained, in basis points. */
export function earlyPaymentAprBps(discountBps: number, daysEarly: number): number {
  integer(discountBps, 1, 9_999, "discountBps");
  integer(daysEarly, 1, 3_650, "daysEarly");
  return Math.round((discountBps * 10_000 * 365) / ((10_000 - discountBps) * daysEarly));
}

/** The smallest discount (whole basis points, rounded up) whose APR reaches yield plus margin over the days gained. */
export function minDiscountBps(vaultYieldBps: number, marginBps: number, daysEarly: number): number {
  integer(vaultYieldBps, 0, 1_000_000, "vaultYieldBps");
  integer(marginBps, 0, 1_000_000, "marginBps");
  integer(daysEarly, 1, 3_650, "daysEarly");
  const numerator = (vaultYieldBps + marginBps) * daysEarly;
  const denominator = 365 * 10_000;
  return Math.ceil((10_000 * numerator) / (denominator + numerator));
}

/** A fair discount for a supplier that printed none: d = D/365 x (r_v + k_s) / 2. */
export function fairDiscountBps(vaultYieldBps: number, supplierRateBps: number, daysAdvanced: number): number {
  integer(vaultYieldBps, 0, 1_000_000, "vaultYieldBps");
  integer(supplierRateBps, 0, 1_000_000, "supplierRateBps");
  integer(daysAdvanced, 1, 3_650, "daysAdvanced");
  return Math.round((daysAdvanced * (vaultYieldBps + supplierRateBps)) / (2 * 365));
}
