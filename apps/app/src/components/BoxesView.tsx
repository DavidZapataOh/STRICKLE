import { BOX_KINDS, type BoxKind } from "@strickle/core";
import { formatMoney } from "@strickle/design/format";
import type { Locale } from "@strickle/design/locale";
import { describeRule } from "@/chain/rules";
import { boxTotal, heldTotals } from "@/chain/vault";
import { dateText, isoDay } from "@/home/format";
import type { DataText } from "@/i18n/slices";
import { fill } from "@/i18n/fill";
import { EmptyState } from "@/ui/EmptyState";
import { ListRow } from "@/ui/ListRow";
import { Progress } from "@/ui/Progress";
import { SplitBar } from "@/ui/SplitBar";
import { type ScreenState, Unready } from "./HomeView";
import { MeasuresShelf } from "./MeasuresShelf";

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
  const money = (units: bigint) => formatMoney(units, lang);
  const shelf = vault.boxes.map((box) => ({ kind: box.kind, ratio: fillRatio(boxTotal(box), targets[box.kind] ?? 0n), share: held.usdc > 0n ? Number((boxTotal(box) * 10_000n) / held.usdc) / 10_000 : 0 }));
  const ruleText = (box: (typeof vault.boxes)[number]) =>
    describeRule(box.rule, vault.now)
      .map((line) => {
        switch (line.key) {
          case "locked": return fill(t.boxesPage.locked, { date: dateText(isoDay(line.until), lang) });
          case "always": return fill(t.boxesPage.always, { hours: line.hours });
          case "below": return fill(t.boxesPage.below, { floor: money(line.floor), hours: line.hours });
          case "restricted": return t.boxesPage.restricted;
          case "free": return t.boxesPage.free;
        }
      })
      .join(" · ");

  return (
    <div className="boxes">
      <section className="boxes-head">
        <p className="tile-label">{t.boxesPage.total}</p>
        <p className="tile-figure"><span className="amount">{money(held.usdc)}</span></p>
        {held.eurc > 0n ? <p className="note">{fill(t.boxesPage.euroTotal, { amount: formatMoney(held.eurc, lang, { asset: "EURC" }) })}</p> : null}
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
            <article key={`${payment.txHash}-${payment.asset}`} className="payment">
              <p className="payment-head">
                <span>{dateText(isoDay(payment.at), lang)}</span>
                <span className="note">{payment.byAgent ? t.boxesPage.payments.agent : t.boxesPage.payments.manual}</span>
                <span className="amount">{formatMoney(payment.total, lang, { asset: payment.asset })}</span>
              </p>
              <SplitBar
                total={payment.total}
                locale={lang}
                asset={payment.asset}
                parts={BOX_KINDS.filter((kind) => (payment.byBox[kind] ?? 0n) > 0n).map((kind) => ({ key: kind, label: t.boxes[kind], units: payment.byBox[kind] ?? 0n }))}
              />
            </article>
          ))
        )}
        {olderPayments ? <p className="note">{t.boxesPage.older}</p> : null}
      </section>
    </div>
  );
}
