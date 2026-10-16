import { getAddress, isAddress } from "viem";

export const SESSION_KEY = "strickle.session.v1";

const FIELDS = ["owner", "vault", "username", "createdAt"];
const isStoredAddress = (value: unknown): value is string => typeof value === "string" && isAddress(value, { strict: false });

function parseSession(value: unknown): Session | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (Object.keys(record).some((key) => !FIELDS.includes(key))) return null;
  const { owner, vault, username, createdAt } = record;
  if (!isStoredAddress(owner) || !isStoredAddress(vault)) return null;
  if (typeof username !== "string" || username.length > 64) return null;
  if (typeof createdAt !== "number" || !Number.isInteger(createdAt) || createdAt < 0) return null;
  return { owner: getAddress(owner), vault: getAddress(vault), username, createdAt };
}

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
    return parseSession(JSON.parse(raw));
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
