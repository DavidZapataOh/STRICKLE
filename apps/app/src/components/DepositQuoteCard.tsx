import type { ReactNode } from "react";
import { formatMoney } from "@strickle/design/format";
import { type DepositQuote, type SwapLeg, bridgeLegOf, expectedReceived } from "@strickle/arc/bridge/types";
import { numberLocale } from "@strickle/design/locale";
import { formatTokenAmount } from "@/deposit/amount";
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
  const leg = bridgeLegOf(quote);
  const swap = quote.legs.find((candidate): candidate is SwapLeg => candidate.kind === "swap");
  const sw = t.deposit.swap;
  return (
    <Card as="section" aria-labelledby="deposit-quote">
      <h2 id="deposit-quote" className="sr-only">
        {t.deposit.confirm}
      </h2>
      <dl className="quote-rows">
        <Row label={q.send}>
          <span className="amount">{swap ? formatTokenAmount(quote.amountSent, "USDT", lang) : formatMoney(quote.amountSent, lang)}</span>
        </Row>
        {swap ? (
          <>
            <Row label={sw.fee}>
              <span className="amount">{formatTokenAmount(swap.providerFee, "USDT", lang)}</span>
            </Row>
            {swap.gas ? (
              <Row label={fill(sw.network, { token: swap.gas.token })}>
                <span className="amount">{swap.gas.amount}</span>
              </Row>
            ) : null}
          </>
        ) : null}
        {leg?.fees.map((fee) => (
          <Row key={fee.kind} label={fee.kind === "forwarder" ? q.forwarder : q.fast}>
            <span className="amount">{formatMoney(fee.amount, lang)}</span>
          </Row>
        ))}
        {!swap && quote.totalDebit !== quote.amountSent ? (
          <Row label={q.total}>
            <span className="amount">{formatMoney(quote.totalDebit, lang)}</span>
          </Row>
        ) : null}
        <Row label={q.receives}>
          {quote.exact ? q.exactly : q.atLeast} <span className="amount">{formatMoney(quote.amountReceivedMin, lang)}</span>
        </Row>
        <Row label={q.network}>{leg?.gas ? `${leg.gas.amount} ${leg.gas.token}` : q.walletShowsNetworkFee}</Row>
      </dl>
      {swap ? (
        <>
          <p>{fill(sw.expected, { amount: formatMoney(expectedReceived(quote), lang) })}</p>
          <p className="field-hint">{fill(sw.floor, { amount: formatMoney(swap.minOut, lang), percent: `${swap.slippageBps / 100}%` })}</p>
          <p className="field-hint">{fill(sw.route, { route: swap.route })}</p>
        </>
      ) : null}
      {leg ? <p>{leg.feeMode === "source" ? q.modeSource : q.modeDestination}</p> : null}
      {quote.expiresAt !== null ? <p className="field-hint">{fill(q.expires, { time: new Intl.DateTimeFormat(numberLocale[lang], { timeStyle: "short" }).format(quote.expiresAt) })}</p> : null}
    </Card>
  );
}
