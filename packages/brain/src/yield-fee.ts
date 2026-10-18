/** The share of the yield an account earned that Strickle's fee is calculated on, in basis points. */
export const YIELD_FEE_BPS = 1_000;
const MIN_HISTORY_DAYS = 28;

/** What a withdrawal brought back above the principal it took out; a loss is no gain. */
export const gainOf = (received: bigint, principal: bigint): bigint => (received > principal ? received - principal : 0n);

/** The fee on a gain and what is left of it, in base units, rounded down so the fee is never more than a tenth. */
export function yieldFee(gain: bigint): { fee: bigint; net: bigint } {
  const fee = gain > 0n ? (gain * BigInt(YIELD_FEE_BPS)) / 10_000n : 0n;
  return { fee, net: (gain > 0n ? gain : 0n) - fee };
}

/** Whether to tell an account that has yield off that it can switch it on: once, after enough history, and only with a rate to quote. */
export function shouldInvite(input: { enabled: boolean; invitedOn: string; historyDays: number; apyBps: number | null }): boolean {
  return !input.enabled && input.invitedOn === "" && input.historyDays >= MIN_HISTORY_DAYS && input.apyBps !== null && input.apyBps > 0;
}
