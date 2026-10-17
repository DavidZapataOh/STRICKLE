import type { BoxKind } from "@strickle/core";
import { formatMoney } from "@strickle/design/format";
import type { Locale } from "@strickle/design/locale";
import { toUsdc } from "@strickle/core";
import { boxTotal, heldTotals } from "@/chain/totals";
import { ruleWords } from "@/home/rule-words";
import type { DataText } from "@/i18n/slices";
import { fill } from "@/i18n/fill";
import { EmptyState } from "@/ui/EmptyState";
import { ListRow } from "@/ui/ListRow";
import { Progress } from "@/ui/Progress";
import { type ScreenState, Unready } from "./HomeView";
import { MeasuresShelf } from "./MeasuresShelf";
import { PaymentCard } from "./PaymentCard";

export function fillRatio(balance: bigint, target: bigint): number | null {
  if (target <= 0n) return null;
  const ratio = Number((balance * 10_000n) / target) / 10_000;
  return Math.min(1, Math.max(0, ratio));
}

export function BoxesView({ lang, t, state, onRetry }: { lang: Locale; t: DataText; state: ScreenState; onRetry?: () => void }) {
  if (state.status !== "ready") return <Unready lang={lang} t={t} state={state} onRetry={onRetry} lines={6} />;

  const { vault, payments, plan, activity, olderPayments } = state.snapshot;
  const targets: Partial<Record<BoxKind, bigint>> = plan ? { taxes: BigInt(plan.targets.taxes), payroll: BigInt(plan.targets.payroll), salary: BigInt(plan.targets.salary), operating: BigInt(plan.targets.operating), emergency: BigInt(plan.targets.emergency) } : {};
  const held = heldTotals(vault);
  const fx = plan?.rates.fx ? { usdcUsd: BigInt(plan.rates.fx.usdcUsd), eurcUsd: BigInt(plan.rates.fx.eurcUsd) } : undefined;
  const money = (units: bigint) => formatMoney(units, lang);
  const shelf = vault.boxes.map((box) => ({ kind: box.kind, ratio: fillRatio(boxTotal(box), targets[box.kind] ?? 0n), share: held.usdc > 0n ? Number((boxTotal(box) * 10_000n) / held.usdc) / 10_000 : 0 }));
  const ruleText = (box: (typeof vault.boxes)[number]) => ruleWords(box.rule, vault.now, lang, t.boxesPage);

  return (
    <div className="boxes">
      <section className="boxes-head">
        <p className="tile-label">{t.boxesPage.total}</p>
        <p className="tile-figure"><span className="amount">{money(held.usdc)}</span></p>
        {held.eurc > 0n ? <p className="note">{fill(t.boxesPage.euroTotal, { amount: formatMoney(held.eurc, lang, { asset: "EURC" }) })}</p> : null}
        {fx && held.eurc > 0n ? <p className="note">{t.currency.total}: {money(held.usdc + toUsdc("EURC", held.eurc, fx))}</p> : null}
        {plan ? <p className="tile-cushion">{plan.cushion.days === null ? t.home.cushion.unknown : fill(t.home.cushion.days, { days: plan.cushion.days })}</p> : null}
        {vault.unallocatedUsdc > 0n ? <p className="note">{fill(t.boxesPage.unallocated, { amount: money(vault.unallocatedUsdc) })}</p> : null}
        <MeasuresShelf boxes={shelf} />
      </section>

      <section aria-label={t.screens.boxes.title}>
        {vault.boxes.map((box) => {
          const total = boxTotal(box);
          const target = targets[box.kind] ?? 0n;
          const ratio = fillRatio(total, target);
          return (
            <div key={box.kind} className="box-row" data-box={box.kind}>
              <ListRow title={t.boxes[box.kind]} rule={ruleText(box)} trailing={<span className="amount">{money(total)}</span>} />
              {ratio === null ? (
                plan ? <p className="note">{t.boxesPage.noTarget}</p> : null
              ) : (
                <div className="box-progress">
                  <Progress ratio={ratio} label={t.boxes[box.kind]} />
                  <span className="note">{fill(t.boxesPage.targetOf, { amount: money(total), target: money(target) })}</span>
                </div>
              )}
              {box.invested > 0n ? <p className="note">{fill(t.boxesPage.invested, { amount: money(box.invested) })}</p> : null}
              {plan?.settings.currencies && box.kind in plan.settings.currencies && plan.settings.currencies[box.kind as keyof typeof plan.settings.currencies] === "EUR" ? <p className="note">{t.currency.heldIn}</p> : null}
              {box.eurc > 0n ? <p className="note">{fill(t.boxesPage.eurc, { amount: formatMoney(box.eurc, lang, { asset: "EURC" }) })}</p> : null}
            </div>
          );
        })}
      </section>

      <section className="payments" aria-labelledby="payments-title">
        <h2 id="payments-title" className="section-title">{t.boxesPage.payments.title}</h2>
        {activity === "unavailable" ? <p className="note">{t.home.states.activityDown}</p> : null}
        {payments.length === 0 && activity === "ok" ? (
          <EmptyState title={t.boxesPage.payments.empty.title} body={t.boxesPage.payments.empty.body} />
        ) : (
          payments.slice(0, 10).map((payment) => (
            <PaymentCard key={`${payment.txHash}-${payment.asset}`} payment={payment} lang={lang} t={t} />
          ))
        )}
        {olderPayments ? <p className="note">{t.boxesPage.older}</p> : null}
      </section>
    </div>
  );
}
