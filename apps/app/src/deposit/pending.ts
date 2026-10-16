import type { Hex } from "viem";
import { browserStorage } from "../account/session.ts";

export const PENDING_KEY = "strickle.deposit.pending.v1";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HASH = /^0x[0-9a-fA-F]{64}$/;

type Store = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export interface Pending {
  id: string;
  burnTx: Hex;
  speed?: "fast" | "slow";
  sourceId?: string;
}

export function savePending(id: string, burnTx: Hex, storage: Store | null = browserStorage(), extra: { speed?: "fast" | "slow"; sourceId?: string } = {}): void {
  try {
    storage?.setItem(PENDING_KEY, JSON.stringify({ id, burnTx, ...extra }));
  } catch {
    // a browser that refuses storage cannot resume after a reload; the deposit itself is unaffected
  }
}

export function loadPending(storage: Store | null = browserStorage()): Pending | null {
  try {
    const raw = storage?.getItem(PENDING_KEY);
    if (!raw) return null;
    const value: unknown = JSON.parse(raw);
    if (typeof value !== "object" || value === null) return null;
    const { id, burnTx, speed, sourceId } = value as Record<string, unknown>;
    if (typeof id !== "string" || !UUID.test(id) || typeof burnTx !== "string" || !HASH.test(burnTx)) return null;
    return { id, burnTx: burnTx as Hex, ...(speed === "fast" || speed === "slow" ? { speed } : {}), ...(typeof sourceId === "string" && sourceId.length <= 40 ? { sourceId } : {}) };
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
