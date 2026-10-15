import { mulDiv } from "@strickle/core";

/** Local-currency amounts are `bigint` minor units with two decimals. */
export function parseLocal(text: string): bigint {
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(text);
  if (!match) throw new RangeError(`not a local amount: "${text}"`);
  return BigInt(match[1]!) * 100n + BigInt((match[2] ?? "").padEnd(2, "0") || "0");
}

export function formatLocal(minor: bigint): string {
  const whole = minor / 100n;
  const cents = (minor % 100n).toString().padStart(2, "0");
  return `${whole}.${cents}`;
}

export function applyRateBps(minor: bigint, rateBps: number): bigint {
  return mulDiv(minor, BigInt(rateBps), 10_000n, "halfEven");
}
