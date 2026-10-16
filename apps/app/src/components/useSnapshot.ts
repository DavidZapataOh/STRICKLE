"use client";

import { useCallback, useEffect, useState } from "react";
import { loadSession } from "@/account/session";
import { type SnapshotScope, loadSnapshot } from "@/chain/snapshot";
import type { ScreenState } from "./HomeView";

const REFRESH_MS = 30_000;

/** Reads the signed-in account's snapshot, refreshes it while the tab is visible and on focus, and keeps what was shown if a refresh fails. */
export function useSnapshot(scope: SnapshotScope): { state: ScreenState; retry: () => void } {
  const [state, setState] = useState<ScreenState>({ status: "loading" });
  const [round, setRound] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    const load = async () => {
      const session = loadSession();
      try {
        const snapshot = session ? await loadSnapshot(session, scope, controller.signal) : null;
        if (controller.signal.aborted) return;
        setState(snapshot ? { status: "ready", snapshot } : { status: "signedOut" });
      } catch {
        if (!controller.signal.aborted) setState((current) => (current.status === "ready" ? current : { status: "error" }));
      }
    };
    void load();
    const refresh = () => document.visibilityState === "visible" && void load();
    const timer = window.setInterval(refresh, REFRESH_MS);
    window.addEventListener("focus", refresh);
    return () => {
      controller.abort();
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
    };
  }, [scope, round]);

  // a retry shows the loading state again at once, from the click rather than from the effect
  const retry = useCallback(() => {
    setState({ status: "loading" });
    setRound((value) => value + 1);
  }, []);

  return { state, retry };
}
