import { getAddress, isAddress } from "viem";
import { z } from "zod";

export const SESSION_KEY = "strickle.session.v1";

const address = z.string().refine((value) => isAddress(value, { strict: false }), "not an address");
const schema = z.object({ owner: address, vault: address, username: z.string().max(64), createdAt: z.number().int().nonnegative() }).strict();

export interface Session {
  owner: `0x${string}`;
  vault: `0x${string}`;
  /** The passkey's label: it identifies the credential at sign-in and is not a secret. May be empty when it was never captured. */
  username: string;
  createdAt: number;
}

export type SessionReader = Pick<Storage, "getItem">;
export type SessionWriter = Pick<Storage, "setItem" | "removeItem">;

/** The browser's storage, or null where there is none (the server, private modes that throw). */
export function browserStorage(): (SessionReader & SessionWriter) | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

export function saveSession(session: Session, storage: SessionWriter | null = browserStorage()): void {
  try {
    storage?.setItem(SESSION_KEY, JSON.stringify({ ...session, owner: getAddress(session.owner), vault: getAddress(session.vault) }));
  } catch {
    // a browser that refuses storage leaves the user signed out next visit, never broken now
  }
}

export function loadSession(storage: SessionReader | null = browserStorage()): Session | null {
  try {
    const raw = storage?.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = schema.safeParse(JSON.parse(raw));
    return parsed.success ? { ...parsed.data, owner: getAddress(parsed.data.owner), vault: getAddress(parsed.data.vault) } : null;
  } catch {
    return null;
  }
}

export function clearSession(storage: SessionWriter | null = browserStorage()): void {
  try {
    storage?.removeItem(SESSION_KEY);
  } catch {
    // nothing to clear
  }
}
