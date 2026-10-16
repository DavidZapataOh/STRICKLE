import type { Locale } from "@strickle/design/locale";
import type { Payment } from "@/chain/payments";
import type { VaultState } from "@/chain/vault";
import { ruleWords } from "@/home/rule-words";
import type { ViewText } from "@/i18n/slices";
import { Amount } from "@/ui/Amount";
import { Card } from "@/ui/Card";
import { EmptyState } from "@/ui/EmptyState";
import { ListRow } from "@/ui/ListRow";
import { MeasuresShelf } from "./MeasuresShelf";
import { PaymentCard } from "./PaymentCard";
import { Skeleton } from "./Skeleton";

export type PublicState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "notfound" }
  | { status: "ready"; vault: VaultState; payments: Payment[]; activity: "ok" | "unavailable"; now: number };

/** Everything here is read from the chain by anyone: balances, rules and the agent's visible payments, never the plan. */
export function PublicView({ lang, t, state }: { lang: Locale; t: ViewText; state: PublicState }) {
  const v = t.view;
  if (state.status === "loading") return <Skeleton label={v.loading} />;
  if (state.status === "error") return <EmptyState title={v.title} body={v.error} />;
  if (state.status === "notfound") return <EmptyState title={v.title} body={v.notFound} />;

  const { vault, payments, activity, now } = state;
  const total = vault.boxes.reduce((sum, box) => sum + box.usdc, 0n);
  const share = (balance: bigint) => (total === 0n ? 0 : Number((balance * 10_000n) / total) / 10_000);

  return (
    <div className="public-view">
      <p className="notice" role="note">
        {v.publicBanner}
      </p>
      <Card as="section" aria-labelledby="pv-total">
        <h2 id="pv-total">{v.total}</h2>
        <p>
          <Amount units={total} locale={lang} />
        </p>
        <MeasuresShelf boxes={vault.boxes.map((box) => ({ kind: box.kind, ratio: null, share: share(box.usdc) }))} />
      </Card>
      <Card as="section" aria-labelledby="pv-boxes">
        <h2 id="pv-boxes">{t.rules.title}</h2>
        {vault.boxes.map((box) => (
          <ListRow key={box.id} title={t.boxes[box.kind]} rule={ruleWords(box.rule, now, lang, t.boxesPage)} trailing={<Amount units={box.usdc} locale={lang} />} />
        ))}
      </Card>
      <Card as="section" aria-labelledby="pv-payments">
        <h2 id="pv-payments">{v.payments}</h2>
        {activity === "unavailable" ? <p>{v.historyUnavailable}</p> : payments.length === 0 ? <p>{v.noPayments}</p> : null}
        {payments.slice(0, 10).map((payment) => (
          <PaymentCard key={`${payment.txHash}-${payment.asset}`} payment={payment} lang={lang} t={t} />
        ))}
      </Card>
    </div>
  );
}

