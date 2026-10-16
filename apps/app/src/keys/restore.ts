import type { Address } from "viem";
import { type NoticeKey, noticeKeyFromSecret, saveNoticeKey } from "./notice-key.ts";
import { decodeRecoveryCode } from "./recovery-code.ts";

export type Restored = { ok: true; verified: boolean } | { ok: false; reason: "invalid" | "mismatch" };

/**
 * Rebuilds a vault's notice key from its recovery code. `verify` tries the key on a real notice of the vault when there is one: true keeps
 * it, false refuses it (the code belongs to another account) and "unknown" keeps it unverified (no notice exists yet).
 */
export async function restoreFromCode(vault: Address, code: string, verify?: (key: NoticeKey) => Promise<boolean | "unknown">): Promise<Restored> {
  const secret = decodeRecoveryCode(code);
  const key = secret === undefined ? undefined : noticeKeyFromSecret(secret);
  if (!key) return { ok: false, reason: "invalid" };
  const verdict = verify ? await verify(key) : "unknown";
  if (verdict === false) return { ok: false, reason: "mismatch" };
  await saveNoticeKey(vault, key.secret);
  return { ok: true, verified: verdict === true };
}
