type Failure = { name?: string; message?: string; shortMessage?: string; details?: string; cause?: unknown };

const DISMISSED = /^(NotAllowedError|AbortError)$/;
const PAYMASTER_CODE = /\bAA3\d\b/;
const PAYMASTER_WORDS = /paymaster|sponsor/i;

/** True when the paymaster refused the operation or its quota is spent (the operation can still go through unsponsored); false for everything else. */
export function isSponsorshipError(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const failure = error as Failure;
  if (DISMISSED.test(String(failure.name))) return false;
  const text = [failure.shortMessage, failure.message, failure.details].filter((part): part is string => typeof part === "string").join(" ");
  if (PAYMASTER_CODE.test(text) || PAYMASTER_WORDS.test(text)) return true;
  return failure.cause !== undefined && isSponsorshipError(failure.cause);
}
