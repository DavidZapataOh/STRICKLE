import type { Locale } from "@strickle/design/locale";
import type { Snapshot } from "@/chain/snapshot";
import { eventRows } from "@/home/rows";
import { salaryTile } from "@/home/tile";
import type { DataText } from "@/i18n/slices";
import { Button } from "@/ui/Button";
import { EmptyState } from "@/ui/EmptyState";
import { EventRows } from "./EventRows";
import { PayTimeline } from "./PayTimeline";
import { SalaryTile } from "./SalaryTile";
import { Skeleton } from "./Skeleton";

export type ScreenState = { status: "loading" } | { status: "signedOut" } | { status: "error" } | { status: "ready"; snapshot: Snapshot };

/** Signed out, failed and loading look the same on every data screen, so they live in one place. */
export function Unready({ lang, t, state, onRetry, lines }: { lang: Locale; t: DataText; state: Exclude<ScreenState, { status: "ready" }>; onRetry?: () => void; lines: number }) {
  if (state.status === "loading") return <Skeleton label={t.home.states.loading} lines={lines} />;
  if (state.status === "signedOut") {
    const s = t.home.states.signedOut;
    return (
      <EmptyState title={s.title} body={s.body}>
        <Button href={`/${lang}/start`}>{s.create}</Button>
        <Button href={`/${lang}/start?mode=login`} variant="quiet">{s.signIn}</Button>
      </EmptyState>
    );
  }
  const s = t.home.states.error;
  return (
    <EmptyState title={s.title} body={s.body}>
      <button type="button" className="btn" data-variant="primary" onClick={onRetry}>{s.retry}</button>
    </EmptyState>
  );
}

export function HomeView({ lang, t, state, today, onRetry }: { lang: Locale; t: DataText; state: ScreenState; today: string; onRetry?: () => void }) {
  if (state.status !== "ready") return <Unready lang={lang} t={t} state={state} onRetry={onRetry} lines={4} />;
  const { snapshot } = state;
  const taxes = snapshot.vault.boxes.find((box) => box.kind === "taxes")?.usdc ?? 0n;
  const plan = snapshot.plan;
  return (
    <div className="home">
      {snapshot.vault.agentPaused ? <p className="note" role="status">{t.home.states.paused}</p> : null}
      <Button href={`/${lang}/deposit`} variant="quiet">
        {t.home.addMoney}
      </Button>
      <Button href={`/${lang}/invoices`} variant="quiet">
        {t.home.invoices}
      </Button>
      {plan ? (
        <>
          <SalaryTile lang={lang} t={t} tile={salaryTile(plan, today, snapshot.vault.agentPaused)} cushion={plan.cushion} />
          <PayTimeline lang={lang} t={t} plan={plan} />
          <EventRows lang={lang} t={t} rows={eventRows(plan, taxes, lang, t)} />
        </>
      ) : snapshot.key === "missing" ? (
        <EmptyState title={t.home.states.noKey.title} body={t.home.states.noKey.body} />
      ) : snapshot.activity === "unavailable" ? (
        <EmptyState title={t.home.states.waiting.title} body={t.home.states.activityDown} />
      ) : (
        <EmptyState title={t.home.states.waiting.title} body={t.home.states.waiting.body} />
      )}
      {snapshot.activity === "unavailable" && plan ? <p className="note">{t.home.states.activityDown}</p> : null}
    </div>
  );
}
