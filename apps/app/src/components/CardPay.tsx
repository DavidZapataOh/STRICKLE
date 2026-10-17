"use client";

import { useEffect, useReducer, useRef } from "react";
import type { PayText } from "@/i18n/slices";
import { type CardState, cardReducer } from "@/payments/card-events";

const POLL_MS = 5_000;
const GIVE_UP_MS = 20 * 60_000;
// a cross-origin iframe cannot size itself: without an explicit height it collapses to nothing
const WIDGET_HEIGHT = 640;

const FAILURE = { unavailable: "unavailable", closed: "closed", blocked: "blocked", expired: "expired", "not-completed": "notCompleted" } as const;

/** What the card option shows in each state. Pure: the widget itself is mounted by CardPay into the container. */
export function CardView({ t, state, onStart, onRetry }: { t: PayText; state: CardState; onStart: () => void; onRetry: () => void }) {
  const c = t.pay.card;
  return (
    <>
      {state.step === "idle" ? (
        <button type="button" className="btn" onClick={onStart}>
          {c.option}
        </button>
      ) : null}
      {state.step === "minting" ? <p role="status">{c.minting}</p> : null}
      {state.step === "widget" || state.step === "submitted" || state.step === "waiting" ? <div id="onramp-root" style={{ height: WIDGET_HEIGHT }} /> : null}
      {state.step === "waiting" ? <p role="status">{c.waiting}</p> : null}
      {state.step === "settled" ? <p role="status">{c.settled}</p> : null}
      {state.step === "failed" ? (
        <>
          <p role="alert">{c[FAILURE[state.reason]]}</p>
          {state.reason !== "closed" ? (
            <button type="button" className="btn" data-variant="quiet" onClick={onRetry}>
              {c.retry}
            </button>
          ) : null}
        </>
      ) : null}
    </>
  );
}

/** Mints a session for this link, loads Circle's kit only now, mounts the hosted widget and follows the purchase until the server says it settled. */
export function CardPay({ t, token, autostart = false, onPaid }: { t: PayText; token: string; autostart?: boolean; onPaid: () => void }) {
  const [state, dispatch] = useReducer(cardReducer, { step: "idle" } as CardState);
  const widget = useRef<{ close(): void } | null>(null);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      widget.current?.close();
    };
  }, []);

  // the payer already pressed "Pay with card" on the page that loaded this code
  const started = useRef(false);
  useEffect(() => {
    if (!autostart || started.current) return;
    started.current = true;
    void start();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, on mount
  }, []);

  async function start() {
    dispatch({ type: "press" });
    widget.current?.close();
    widget.current = null;
    try {
      const response = await fetch(`/api/pay/${token}/card`, { method: "POST" });
      const body = (await response.json()) as { status: string; session?: { sessionId: string; sessionToken: string; widgetUrl: string; expiresAt: string; destinationWallet?: string } };
      if (body.status === "closed") return void dispatch({ type: "closed" });
      if (body.status !== "session" || !body.session) return void dispatch({ type: "unavailable" });
      const session = body.session;
      dispatch({ type: "minted", sessionId: session.sessionId });
      // the container exists only after the render the dispatch above causes
      await new Promise((resolve) => requestAnimationFrame(resolve));
      const container = document.getElementById("onramp-root");
      if (!container || !alive.current) return;
      const { createOnrampKit } = await import("@circle-fin/onramp-kit");
      widget.current = createOnrampKit().mountIframe({
        session,
        container,
        onDepositSubmitted: () => {
          dispatch({ type: "submitted" });
          void follow(session.sessionId);
        },
        onDepositNotCompleted: () => dispatch({ type: "not-completed" }),
        onInitializationError: () => dispatch({ type: "blocked" }),
      });
    } catch {
      dispatch({ type: "blocked" });
    }
  }

  async function follow(sessionId: string) {
    const deadline = Date.now() + GIVE_UP_MS;
    while (alive.current && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, POLL_MS));
      try {
        const response = await fetch(`/api/pay/${token}/card/${sessionId}`, { cache: "no-store" });
        const body = (await response.json()) as { status?: string; state?: string };
        if (body.status === "ok" && body.state === "settled") {
          dispatch({ type: "settled" });
          onPaid();
          return;
        }
        dispatch({ type: "polled" });
      } catch {
        // a dropped request is retried on the next turn
      }
    }
    if (alive.current) dispatch({ type: "expired" });
  }

  return <CardView t={t} state={state} onStart={() => void start()} onRetry={() => void start()} />;
}
