import type { ReactNode } from "react";
import { formatMoney } from "@strickle/design/format";
import type { DepositQuote } from "@strickle/arc/bridge/types";
import { numberLocale } from "@strickle/design/locale";
import type { Locale } from "@/i18n/config";
import { fill } from "@/i18n/fill";
import type { DepositText } from "@/i18n/slices";
import { Card } from "@/ui/Card";

const Row = ({ label, children }: { label: string; children: ReactNode }) => (
  <div className="quote-row">
    <dt>{label}</dt>
    <dd>{children}</dd>
  </div>
);

/** One row group per leg of the quote; the bridge is the only leg there is today. */
export function DepositQuoteCard({ lang, t, quote }: { lang: Locale; t: DepositText; quote: DepositQuote }) {
  const q = t.deposit.quote;
  const leg = quote.legs.find((candidate) => candidate.kind === "bridge");
  return (
    <Card as="section" aria-labelledby="deposit-quote">
      <h2 id="deposit-quote" className="sr-only">
        {t.deposit.confirm}
      </h2>
      <dl className="quote-rows">
        <Row label={q.send}>
          <span className="amount">{formatMoney(quote.amountSent, lang)}</span>
        </Row>
        {leg?.fees.map((fee) => (
          <Row key={fee.kind} label={fee.kind === "forwarder" ? q.forwarder : q.fast}>
            <span className="amount">{formatMoney(fee.amount, lang)}</span>
          </Row>
        ))}
        {quote.totalDebit !== quote.amountSent ? (
          <Row label={q.total}>
            <span className="amount">{formatMoney(quote.totalDebit, lang)}</span>
          </Row>
        ) : null}
        <Row label={q.receives}>
          {quote.exact ? q.exactly : q.atLeast} <span className="amount">{formatMoney(quote.amountReceivedMin, lang)}</span>
        </Row>
        <Row label={q.network}>{leg?.gas ? `${leg.gas.amount} ${leg.gas.token}` : q.walletShowsNetworkFee}</Row>
      </dl>
      {leg ? <p>{leg.feeMode === "source" ? q.modeSource : q.modeDestination}</p> : null}
      {quote.expiresAt !== null ? <p className="field-hint">{fill(q.expires, { time: new Intl.DateTimeFormat(numberLocale[lang], { timeStyle: "short" }).format(quote.expiresAt) })}</p> : null}
    </Card>
  );
}
