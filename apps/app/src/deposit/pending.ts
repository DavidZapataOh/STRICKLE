import type { Hex } from "viem";
import { browserStorage } from "../account/session.ts";

export const PENDING_KEY = "strickle.deposit.pending.v1";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HASH = /^0x[0-9a-fA-F]{64}$/;

type Store = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export function savePending(id: string, burnTx: Hex, storage: Store | null = browserStorage()): void {
  try {
    storage?.setItem(PENDING_KEY, JSON.stringify({ id, burnTx }));
  } catch {
    // a browser that refuses storage cannot resume after a reload; the deposit itself is unaffected
  }
}

export function loadPending(storage: Store | null = browserStorage()): { id: string; burnTx: Hex } | null {
  try {
    const raw = storage?.getItem(PENDING_KEY);
    if (!raw) return null;
    const value: unknown = JSON.parse(raw);
    if (typeof value !== "object" || value === null) return null;
    const { id, burnTx } = value as Record<string, unknown>;
    return typeof id === "string" && UUID.test(id) && typeof burnTx === "string" && HASH.test(burnTx) ? { id, burnTx: burnTx as Hex } : null;
  } catch {
    return null;
  }
}

export function clearPending(storage: Store | null = browserStorage()): void {
  try {
    storage?.removeItem(PENDING_KEY);
  } catch {
    // nothing to clear in a browser without storage
  }
}
