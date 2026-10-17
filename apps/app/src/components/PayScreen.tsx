"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useState } from "react";
import type { Locale } from "@/i18n/config";
import type { PayText } from "@/i18n/slices";
import type { PublicInvoice } from "@/server/pay";
import { EmptyState } from "@/ui/EmptyState";
import { PayView } from "./PayView";
import { Skeleton } from "./Skeleton";

// the wallet and bridge code load only when the payer presses a button
const PayActive = dynamic(() => import("./PayActive").then((m) => m.PayActive));

type State = { status: "loading" } | { status: "notFound" } | { status: "error" } | { status: "ready"; invoice: PublicInvoice };

export function PayScreen({ lang, t, token }: { lang: Locale; t: PayText; token: string }) {
  const [state, setState] = useState<State>({ status: "loading" });
  const [round, setRound] = useState(0);
  const [start, setStart] = useState<"arc" | "other" | "card" | null>(null);
  const [copyNote, setCopyNote] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/pay/${token}`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const body = (await response.json()) as { status: string; invoice?: PublicInvoice };
        if (response.status === 404) setState({ status: "notFound" });
        else if (body.status === "ok" && body.invoice) setState({ status: "ready", invoice: body.invoice });
        else setState({ status: "error" });
      })
      .catch(() => {
        if (!controller.signal.aborted) setState({ status: "error" });
      });
    return () => controller.abort();
  }, [token, round]);

  const refresh = useCallback(() => setRound((value) => value + 1), []);

  if (state.status === "loading") return <Skeleton label={t.pay.loading} />;
  if (state.status === "notFound") return <EmptyState title={t.pay.options.direct} body={t.pay.notFound} />;
  if (state.status === "error") {
    return (
      <EmptyState title={t.pay.options.direct} body={t.pay.error}>
        <button type="button" className="btn" onClick={refresh}>
          {t.pay.retryClaim}
        </button>
      </EmptyState>
    );
  }
  // no wallet or bridge code until the payer presses a way to pay
  if (start) return <PayActive lang={lang} t={t} token={token} invoice={state.invoice} start={start} onPaid={refresh} />;
  const { invoice } = state;
  async function copy() {
    try {
      await navigator.clipboard.writeText(invoice.vault);
      setCopyNote(t.pay.copied);
    } catch {
      setCopyNote(t.pay.copyFailed);
    }
  }
  return <PayView lang={lang} t={t} invoice={invoice} phase="idle" otherOpen={false} copyNote={copyNote} actions={{ arc: () => setStart("arc"), other: () => setStart("other"), card: () => setStart("card"), copy: () => void copy() }} />;
}
