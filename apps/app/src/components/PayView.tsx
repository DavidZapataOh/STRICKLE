import { formatMoney } from "@strickle/design/format";
import type { ReactNode } from "react";
import type { Locale } from "@/i18n/config";
import { fill } from "@/i18n/fill";
import type { PayText } from "@/i18n/slices";
import type { PublicInvoice } from "@/server/pay";
import type { InjectedWallet } from "@/wallet/injected";
import { Card } from "@/ui/Card";
import { Chip } from "@/ui/Chip";

export type PayPhase = "idle" | "choose" | "connecting" | "needEoa" | "noWallet" | "sending" | "confirming" | "thanks" | "failed";

export interface PayActions {
  arc(): void;
  pick?(wallet: InjectedWallet): void;
  other(): void;
  copy(): void;
}

/** Each way to pay is an entry here; a later rail adds one. */
type Option = { id: string; title: string; body: ReactNode };

export function PayView({ lang, t, invoice, phase, actions, otherOpen, otherSlot, copyNote, wallets = [] }: { wallets?: InjectedWallet[]; lang: Locale; t: PayText; invoice: PublicInvoice; phase: PayPhase; actions: PayActions; otherOpen: boolean; otherSlot?: ReactNode; copyNote?: string }) {
  const p = t.pay;
  const amount = BigInt(invoice.amount);
  const paid = BigInt(invoice.paid);
  const remaining = BigInt(invoice.remaining);
  const status = p.status[invoice.status];
  const open = !invoice.closed && !invoice.expired;

  const options: Option[] = open
    ? [
        {
          id: "arc",
          title: p.options.arc,
          body: (
            <>
              {phase === "needEoa" ? <p role="alert">{p.needEoa}</p> : null}
              {phase === "noWallet" ? <p role="alert">{p.noWallet}</p> : null}
              {phase === "sending" ? <p role="status">{p.sending}</p> : null}
              {phase === "confirming" ? <p role="status">{p.confirming}</p> : null}
              {phase === "failed" ? <p role="alert">{p.paymentFailed}</p> : null}
              {phase === "thanks" ? <p role="status">{p.thanks}</p> : null}
              {phase === "choose" ? (
                <div role="group" aria-label={p.connect} className="wallet-list">
                  {wallets.map((wallet) => (
                    <button key={wallet.uuid} type="button" className="btn" data-variant="quiet" onClick={() => actions.pick?.(wallet)}>
                      {/* eslint-disable-next-line @next/next/no-img-element -- an inline data: image announced by the wallet, never fetched */}
                      <img src={wallet.icon} alt="" width={24} height={24} />
                      {wallet.name}
                    </button>
                  ))}
                </div>
              ) : null}
              {phase === "idle" || phase === "failed" || phase === "needEoa" || phase === "noWallet" ? (
                <button type="button" className="btn" onClick={actions.arc}>
                  {p.connect}
                </button>
              ) : null}
            </>
          ),
        },
        {
          id: "other",
          title: p.options.other,
          body: otherOpen ? (
            otherSlot
          ) : (
            <button type="button" className="btn" data-variant="quiet" onClick={actions.other}>
              {p.options.other}
            </button>
          ),
        },
        {
          id: "direct",
          title: p.options.direct,
          body: (
            <>
              <p>{fill(p.directBody, { amount: formatMoney(remaining, lang).replace(/^US\$\s?/, ""), address: invoice.vault, payee: invoice.payeeName })}</p>
              <p className="note">{p.addressWarning}</p>
              <button type="button" className="btn" data-variant="quiet" onClick={actions.copy}>
                {p.copy}
              </button>
              <p role="status" aria-live="polite">
                {copyNote ?? ""}
              </p>
            </>
          ),
        },
      ]
    : [];

  return (
    <div className="deposit">
      <Card as="section" aria-labelledby="pay-head">
        <h2 id="pay-head">{fill(p.title, { payee: invoice.payeeName })}</h2>
        <p>
          <Chip tone={invoice.status === "paid" ? "calyx" : "neutral"}>{status}</Chip>
        </p>
        <p>{invoice.label}</p>
        {invoice.note ? <p className="field-hint">{invoice.note}</p> : null}
        <dl className="quote-rows">
          <div className="quote-row">
            <dt>{p.due}</dt>
            <dd className="amount">{formatMoney(amount, lang)}</dd>
          </div>
        </dl>
        {paid > 0n && invoice.status !== "void" ? <p>{fill(p.paidSoFar, { paid: formatMoney(paid, lang), amount: formatMoney(amount, lang), remaining: formatMoney(remaining, lang) })}</p> : null}
        {invoice.expired ? <p role="status">{fill(p.expired, { payee: invoice.payeeName })}</p> : null}
        {invoice.closed ? <p>{p.closedBody}</p> : null}
      </Card>
      {options.map((option) => (
        <Card as="section" key={option.id} aria-labelledby={`pay-${option.id}`}>
          <h2 id={`pay-${option.id}`}>{option.title}</h2>
          {option.body}
        </Card>
      ))}
    </div>
  );
}
