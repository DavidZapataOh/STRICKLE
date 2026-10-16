"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { networks } from "@strickle/arc/networks";
import { appNetwork } from "@/config/network";
import type { Locale } from "@/i18n/config";
import type { InvoicesText } from "@/i18n/slices";
import { signOwnerSession } from "@/payments/sign-in";
import type { SerializedInvoice } from "@/server/invoices";
import type { Account } from "@/settings/account";
import { connectWallet } from "@/wallet/passkey";
import { type InvoiceError, type InvoicesEvent, type InvoicesState, InvoicesView } from "./InvoicesView";

const REFRESH_MS = 30_000;
const json = (body: unknown): RequestInit => ({ method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
const failure = (status: number): InvoiceError => (status === 401 ? "unauthorized" : status === 429 ? "rate-limited" : status === 400 ? "rejected" : "unavailable");

/** The signed-in side of the invoices screen. The passkey wallet is loaded only when the owner presses the signature button. */
export function InvoicesActive({ lang, t, account }: { lang: Locale; t: InvoicesText; account: Account }) {
  const [state, setState] = useState<InvoicesState>({ status: "loading" });
  const busy = useRef(false);

  const [round, setRound] = useState(0);
  const reload = useCallback(() => setRound((value) => value + 1), []);

  useEffect(() => {
    const controller = new AbortController();
    const read = async () => {
      try {
        const response = await fetch("/api/invoices", { cache: "no-store", signal: controller.signal });
        if (response.status === 401) {
          setState({ status: "needsSignature", busy: false, error: null });
          return;
        }
        const body = (await response.json()) as { status: string; invoices?: SerializedInvoice[] };
        if (body.status === "ok" && body.invoices) {
          const invoices = body.invoices;
          setState((current) => ({ status: "ready", invoices, busy: false, error: null, confirming: current.status === "ready" ? current.confirming : null, copied: current.status === "ready" ? current.copied : null }));
        } else setState({ status: "needsSignature", busy: false, error: failure(response.status) });
      } catch {
        if (!controller.signal.aborted) setState((current) => (current.status === "ready" ? { ...current, error: "unavailable" } : { status: "needsSignature", busy: false, error: "unavailable" }));
      }
    };
    void read();
    const tick = () => {
      if (document.visibilityState === "visible") void read();
    };
    const id = setInterval(tick, REFRESH_MS);
    return () => {
      controller.abort();
      clearInterval(id);
    };
  }, [round]);

  const mutate = useCallback(
    async (run: () => Promise<Response>) => {
      if (busy.current) return;
      busy.current = true;
      setState((current) => (current.status === "ready" ? { ...current, busy: true, error: null, confirming: null } : current));
      try {
        const response = await run();
        if (!response.ok) setState((current) => (current.status === "ready" ? { ...current, busy: false, error: failure(response.status) } : current));
        else reload();
      } catch {
        setState((current) => (current.status === "ready" ? { ...current, busy: false, error: "unavailable" } : current));
      } finally {
        busy.current = false;
      }
    },
    [reload],
  );

  async function sign() {
    setState({ status: "needsSignature", busy: true, error: null });
    try {
      const wallet = await connectWallet("login");
      const body = await signOwnerSession(wallet, { chainId: networks[appNetwork()].chain.id, vault: account.vault });
      const response = await fetch("/api/owner-session", json(body));
      if (!response.ok) setState({ status: "needsSignature", busy: false, error: failure(response.status) });
      else reload();
    } catch {
      setState({ status: "needsSignature", busy: false, error: "unavailable" });
    }
  }

  function onEvent(event: InvoicesEvent) {
    switch (event.type) {
      case "sign":
        void sign();
        return;
      case "create":
        void mutate(() => fetch("/api/invoices", json(event.values)));
        return;
      case "copy":
        void navigator.clipboard.writeText(event.url).then(
          () => setState((current) => (current.status === "ready" ? { ...current, copied: event.id } : current)),
          () => setState((current) => (current.status === "ready" ? { ...current, error: "unavailable" } : current)),
        );
        return;
      case "ask":
        setState((current) => (current.status === "ready" ? { ...current, confirming: { kind: event.kind, id: event.id } } : current));
        return;
      case "cancel":
        setState((current) => (current.status === "ready" ? { ...current, confirming: null } : current));
        return;
      case "do":
        void mutate(() => fetch(`/api/invoices/${event.id}`, json({ action: event.kind })));
        return;
      case "confirm-payment":
        void mutate(() => fetch(`/api/invoices/${event.id}`, json({ action: "confirm", paymentId: event.paymentId })));
        return;
      case "dismiss-payment":
        void mutate(() => fetch(`/api/invoices/${event.id}`, json({ action: "dismiss", paymentId: event.paymentId })));
        return;
      case "check":
        void mutate(() => fetch("/api/invoices/reconcile", { method: "POST" }));
        return;
    }
  }

  return <InvoicesView lang={lang} t={t} state={state} origin={typeof window === "undefined" ? "" : window.location.origin} onEvent={onEvent} />;
}
