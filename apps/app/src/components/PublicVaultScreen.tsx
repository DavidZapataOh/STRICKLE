"use client";

import { useEffect, useState } from "react";
import type { Address } from "viem";
import type { Locale } from "@/i18n/config";
import type { ViewText } from "@/i18n/slices";
import { NotAVaultError, loadPublicSnapshot } from "@/view/public-snapshot";
import { type PublicState, PublicView } from "./PublicView";

export function PublicVaultScreen({ lang, t, vault }: { lang: Locale; t: ViewText; vault: Address }) {
  const [state, setState] = useState<PublicState>({ status: "loading" });
  const [round, setRound] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    loadPublicSnapshot(vault, controller.signal).then(
      (snapshot) => setState({ status: "ready", ...snapshot, now: Math.floor(Date.now() / 1000) }),
      (error) => {
        if (!controller.signal.aborted) setState(error instanceof NotAVaultError ? { status: "notfound" } : { status: "error" });
      },
    );
    return () => controller.abort();
  }, [vault, round]);

  return (
    <>
      <PublicView lang={lang} t={t} state={state} />
      {state.status === "error" ? (
        <button
          type="button"
          className="btn"
          onClick={() => {
            setState({ status: "loading" });
            setRound((value) => value + 1);
          }}
        >
          {t.view.retry}
        </button>
      ) : null}
    </>
  );
}
