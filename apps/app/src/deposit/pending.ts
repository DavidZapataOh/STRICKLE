import type { Hex } from "viem";
import { browserStorage } from "../account/session.ts";

export const PENDING_KEY = "strickle.deposit.pending.v1";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HASH = /^0x[0-9a-fA-F]{64}$/;

type Store = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export interface PendingDeposit {
  id: string;
  burnTx: Hex | null;
  swapTx: Hex | null;
  /** USDC the conversion credited, in base units: what the server must be told and what a reload may offer at most. */
  swapOut?: string;
  speed?: "fast" | "slow";
  sourceId?: string;
}

function save(key: string, id: string, hashes: { burnTx?: Hex; swapTx?: Hex }, storage: Store | null, extra: { speed?: "fast" | "slow"; sourceId?: string; swapOut?: string }): void {
  try {
    storage?.setItem(key, JSON.stringify({ id, ...hashes, ...extra }));
  } catch {
    // a browser that refuses storage cannot resume after a reload; the deposit itself is unaffected
  }
}

function load(key: string, storage: Store | null): PendingDeposit | null {
  try {
    const raw = storage?.getItem(key);
    if (!raw) return null;
    const value: unknown = JSON.parse(raw);
    if (typeof value !== "object" || value === null) return null;
    const { id, burnTx, swapTx, swapOut, speed, sourceId } = value as Record<string, unknown>;
    if (typeof id !== "string" || !UUID.test(id)) return null;
    const burn = typeof burnTx === "string" && HASH.test(burnTx) ? (burnTx as Hex) : null;
    const swap = typeof swapTx === "string" && HASH.test(swapTx) ? (swapTx as Hex) : null;
    if (!burn && !swap) return null;
    return { id, burnTx: burn, swapTx: swap, ...(typeof swapOut === "string" && /^[1-9][0-9]{0,15}$/.test(swapOut) ? { swapOut } : {}), ...(speed === "fast" || speed === "slow" ? { speed } : {}), ...(typeof sourceId === "string" && sourceId.length <= 40 ? { sourceId } : {}) };
  } catch {
    return null;
  }
}

function clear(key: string, storage: Store | null): void {
  try {
    storage?.removeItem(key);
  } catch {
    // nothing to clear in a browser without storage
  }
}

export const savePending = (id: string, hashes: { burnTx?: Hex; swapTx?: Hex }, storage: Store | null = browserStorage(), extra: { speed?: "fast" | "slow"; sourceId?: string; swapOut?: string } = {}): void => save(PENDING_KEY, id, hashes, storage, extra);
export const loadPending = (storage: Store | null = browserStorage()): PendingDeposit | null => load(PENDING_KEY, storage);
export const clearPending = (storage: Store | null = browserStorage()): void => clear(PENDING_KEY, storage);

/** A pending deposit of its own for a place that has more than one (each payment link keeps its own), so one screen never resumes another's. */
export function pendingStore(scope?: string) {
  const key = scope ? `${PENDING_KEY}:${scope}` : PENDING_KEY;
  return {
    save: (id: string, hashes: { burnTx?: Hex; swapTx?: Hex }, extra: { speed?: "fast" | "slow"; sourceId?: string; swapOut?: string } = {}) => save(key, id, hashes, browserStorage(), extra),
    load: () => load(key, browserStorage()),
    clear: () => clear(key, browserStorage()),
  };
}
