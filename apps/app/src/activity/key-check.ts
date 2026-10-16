import { openNotice } from "@strickle/agent/notices";
import { type Address, type Hex, hexToBytes } from "viem";
import type { NoticeKey } from "../keys/notice-key.ts";

export type KeyVerdict = "matches" | "mismatch" | "unknown";

const NEWEST = 5;

export function verifyKeyAgainstNotices(sealed: readonly { id: bigint; sealed: Hex }[], vault: Address, key: NoticeKey): KeyVerdict {
  if (sealed.length === 0) return "unknown";
  const newest = [...sealed].sort((a, b) => (a.id < b.id ? 1 : a.id > b.id ? -1 : 0)).slice(0, NEWEST);
  for (const item of newest) {
    try {
      if (openNotice(key.secret, key.publicKey, vault, item.id, hexToBytes(item.sealed))) return "matches";
    } catch {
      // a notice that does not open under this key says nothing against the others
    }
  }
  return "mismatch";
}
