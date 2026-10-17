import { formatMoney } from "@strickle/design/format";
import type { Locale } from "@/i18n/config";
import { fill } from "@/i18n/fill";
import type { InvoicesText } from "@/i18n/slices";
import type { SerializedInvoice } from "@/server/invoices";
import { Button } from "@/ui/Button";
import { Card } from "@/ui/Card";
import { Chip } from "@/ui/Chip";
import { EmptyState } from "@/ui/EmptyState";
import { InvoiceForm, type NewInvoiceValues } from "./InvoiceForm";
import { Skeleton } from "./Skeleton";

export type InvoiceError = "rate-limited" | "unavailable" | "unauthorized" | "rejected";
export type InvoicesState =
  | { status: "loading" }
  | { status: "signedOut" }
  | { status: "needsSignature"; busy: boolean; error: InvoiceError | null }
  | { status: "ready"; invoices: SerializedInvoice[]; busy: boolean; error: InvoiceError | null; confirming: { kind: "rotate" | "void"; id: string } | null; copied: string | null };

export type InvoicesEvent =
  | { type: "sign" }
  | { type: "create"; values: NewInvoiceValues }
  | { type: "copy"; id: string; url: string }
  | { type: "ask"; kind: "rotate" | "void"; id: string }
  | { type: "cancel" }
  | { type: "do"; kind: "rotate" | "void"; id: string }
  | { type: "confirm-payment"; id: string; paymentId: string }
  | { type: "dismiss-payment"; id: string; paymentId: string }
  | { type: "check" };

export const payUrl = (origin: string, lang: Locale, token: string): string => `${origin}/${lang}/pay/${token}`;
const short = (address: string) => `${address.slice(0, 6)}…${address.slice(-4)}`;
const dateText = (iso: string, lang: Locale) => new Intl.DateTimeFormat(lang === "pt-br" ? "pt-BR" : lang === "es" ? "es-419" : "en-US", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(iso));

export function InvoicesView({ lang, t, state, origin, onEvent }: { lang: Locale; t: InvoicesText; state: InvoicesState; origin: string; onEvent: (event: InvoicesEvent) => void }) {
  const s = t.invoices;
  if (state.status === "loading") return <Skeleton label={s.loading} />;
  if (state.status === "signedOut") {
    return (
      <EmptyState title={s.signedOut.title} body={s.signedOut.body}>
        <Button href={`/${lang}/start`}>{s.signedOut.create}</Button>
        <Button href={`/${lang}/start?mode=login`} variant="quiet">
          {s.signedOut.signIn}
        </Button>
      </EmptyState>
    );
  }
  if (state.status === "needsSignature") {
    return (
      <Card as="section" aria-labelledby="invoice-sign">
        <h2 id="invoice-sign">{s.title}</h2>
        <p>{s.signature.explain}</p>
        {state.error ? <p role="alert">{s.errors[state.error]}</p> : null}
        <button type="button" className="btn" disabled={state.busy} onClick={() => onEvent({ type: "sign" })}>
          {s.signature.button}
        </button>
      </Card>
    );
  }

  return (
    <div className="deposit">
      {state.error ? (
        <p className="note" role="alert">
          {s.errors[state.error]}
        </p>
      ) : null}
      <InvoiceForm t={t} busy={state.busy} onCreate={(values) => onEvent({ type: "create", values })} />
      <button type="button" className="btn" data-variant="quiet" disabled={state.busy} onClick={() => onEvent({ type: "check" })}>
        {s.check}
      </button>
      {state.invoices.length === 0 ? <EmptyState title={s.title} body={s.empty} /> : null}
      {state.invoices.map((invoice) => {
        const url = payUrl(origin, lang, invoice.token);
        const asking = state.confirming?.id === invoice.id ? state.confirming.kind : null;
        const amount = BigInt(invoice.amount);
        const paid = BigInt(invoice.paid);
        return (
          <Card as="section" key={invoice.id} aria-labelledby={`invoice-${invoice.id}`}>
            <h2 id={`invoice-${invoice.id}`}>{invoice.label}</h2>
            <p>
              <Chip tone={invoice.status === "paid" ? "calyx" : "neutral"}>{s.status[invoice.status as keyof typeof s.status]}</Chip>
            </p>
            <p className="amount">{formatMoney(amount, lang)}</p>
            {paid > 0n ? <p>{fill(s.paidOf, { paid: formatMoney(paid, lang), amount: formatMoney(amount, lang) })}</p> : null}
            <p className="field-hint">{invoice.expiresAt ? fill(s.expiry, { date: dateText(invoice.expiresAt, lang) }) : s.noExpiry}</p>
            <input className="share-field" readOnly value={url} aria-label={s.copyLink} onFocus={(event) => event.currentTarget.select()} />
            <div className="actions">
              <button type="button" className="btn" data-variant="quiet" onClick={() => onEvent({ type: "copy", id: invoice.id, url })}>
                {s.copyLink}
              </button>
              {invoice.status !== "void" ? (
                <>
                  <button type="button" className="btn" data-variant="quiet" onClick={() => onEvent({ type: "ask", kind: "rotate", id: invoice.id })}>
                    {s.newLink}
                  </button>
                  <button type="button" className="btn" data-variant="quiet" onClick={() => onEvent({ type: "ask", kind: "void", id: invoice.id })}>
                    {s.void}
                  </button>
                </>
              ) : null}
            </div>
            <p role="status" aria-live="polite">
              {state.copied === invoice.id ? s.copied : ""}
            </p>
            {asking ? (
              <div role="alertdialog" aria-label={asking === "rotate" ? s.newLink : s.void} className="note">
                <p>{asking === "rotate" ? s.newLinkConfirm : s.voidConfirm}</p>
                <button type="button" className="btn" onClick={() => onEvent({ type: "do", kind: asking, id: invoice.id })}>
                  {s.confirmYes}
                </button>
                <button type="button" className="btn" data-variant="quiet" onClick={() => onEvent({ type: "cancel" })}>
                  {s.cancel}
                </button>
              </div>
            ) : null}
            {invoice.suggestions.map((suggestion) => (
              <div key={suggestion.id} className="note">
                <p>{fill(s.suggestion.title, { amount: formatMoney(BigInt(suggestion.amount), lang), payer: short(suggestion.payer) })}</p>
                {suggestion.viaCard ? <p className="field-hint">{s.suggestion.viaCard}</p> : null}
                <button type="button" className="btn" onClick={() => onEvent({ type: "confirm-payment", id: invoice.id, paymentId: suggestion.id })}>
                  {s.suggestion.confirm}
                </button>
                <button type="button" className="btn" data-variant="quiet" onClick={() => onEvent({ type: "dismiss-payment", id: invoice.id, paymentId: suggestion.id })}>
                  {s.suggestion.dismiss}
                </button>
              </div>
            ))}
          </Card>
        );
      })}
    </div>
  );
}
