import type { DepositError } from "./flow.ts";
import type { DepositText } from "../i18n/slices.ts";

export const describeError = (code: DepositError, t: DepositText): string => t.deposit.errors[code];

/** What a wallet, the network or the quote threw, as the one code the screen knows how to explain. */
export function errorOf(thrown: unknown): DepositError {
  if (typeof thrown !== "object" || thrown === null) return "unavailable";
  const { code, name, message } = thrown as { code?: unknown; name?: unknown; message?: unknown };
  if (name === "QuoteRefusal") return code === "expired" ? "quote-expired" : code === "cost-too-high" ? "cost-too-high" : code === "stale" ? "stale" : code === "insufficient-balance" ? "insufficient-funds" : "quote-refused";
  if (code === 4001) return "rejected";
  if (code === 4902 || code === 4901) return "wrong-chain";
  const text = typeof message === "string" ? message : "";
  if (/user (rejected|denied)|rejected the request/i.test(text)) return "rejected";
  if (/insufficient .*(balance|funds)|insufficient funds|exceeds balance/i.test(text)) return "insufficient-funds";
  if (/fee quote is not safe|call estimate again/i.test(text)) return "quote-expired";
  if (/failed to switch to chain|wallet_switchEthereumChain|unsupported method/i.test(text)) return "wrong-chain";
  return "unavailable";
}
