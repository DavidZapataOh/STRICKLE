import type { DepositQuote } from "@strickle/arc/bridge/types";
import { bridgeLegOf } from "@strickle/arc/bridge/types";

const CENT = 10_000n;

/** How much a payer must send from another chain so that `target` reaches the vault: exactly the target for a receive-exact quote, the target plus the transfer fees (rounded up to the cent) when the fees come out of the amount. */
export function amountToSend(target: bigint, quote: DepositQuote): bigint {
  if (quote.exact) return target;
  const leg = bridgeLegOf(quote);
  const fees = leg ? leg.fees.reduce((sum, fee) => sum + fee.amount, 0n) : 0n;
  const raw = target + fees;
  return ((raw + CENT - 1n) / CENT) * CENT;
}
