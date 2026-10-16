"use client";

import { useMemo, useSyncExternalStore } from "react";
import { SESSION_KEY, type Session, loadSession } from "./session";

const subscribe = (notify: () => void) => {
  window.addEventListener("storage", notify);
  return () => window.removeEventListener("storage", notify);
};

const read = (): string | null => {
  try {
    return window.localStorage.getItem(SESSION_KEY);
  } catch {
    return null;
  }
};

/** The signed-in account kept on this device: `undefined` while the page is still rendering on the server, `null` when there is none. */
export function useStoredSession(): Session | null | undefined {
  const raw = useSyncExternalStore(subscribe, read, () => undefined);
  return useMemo(() => (raw === undefined ? undefined : loadSession({ getItem: () => raw })), [raw]);
}
