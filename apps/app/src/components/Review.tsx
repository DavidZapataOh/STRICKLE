import { formatMoney, formatPercent } from "@strickle/design/format";
import type { Locale } from "@strickle/design/locale";
import { BOX_KINDS } from "@strickle/core";
import type { Dictionary } from "@/i18n/dictionaries";
import { fill } from "@/i18n/fill";
import type { Diagnosis, FallbackCode } from "@/onboarding/diagnosis";
import type { Ready } from "@/onboarding/types";
import { usd } from "@/onboarding/answers";
import { SplitBar } from "@/ui/SplitBar";

const REASON: Record<FallbackCode, keyof Dictionary["start"]["review"]> = {
  "no-rule": "reasonNoRule",
  "other-regime": "reasonOther",
  "rate-unavailable": "reasonRate",
  expired: "reasonExpired",
  "needs-prior-year": "reasonNeedsYear",
  "out-of-regime": "reasonOutOfRegime",
};

/** What the agent will do with the user's numbers, in the order a person checks them: the tax line, the first payment, the salary, the waits. */
export function Review({ lang, t, answers, diagnosis, regimeName, confirmed, onConfirmed, emergency }: { lang: Locale; t: Dictionary; answers: Ready; diagnosis: Diagnosis; regimeName: string | undefined; confirmed: boolean; onConfirmed: (value: boolean) => void; emergency: React.ReactNode }) {
  const r = t.start.review;
  const rate = formatPercent(diagnosis.rateBps, lang);
  const { tax } = diagnosis;
  const regime = regimeName ?? tax.regime;
  const taxLine =
    tax.origin === "fallback" ? fill(r.taxFallback, { rate }) : tax.basis === "annual" ? fill(r.taxAnnual, { rate, regime }) : tax.basis === "fixed-fee" ? fill(r.taxFixed, { rate, regime }) : fill(r.taxLine, { rate, regime });
  const first = Object.values(diagnosis.month.firstPayment).reduce((sum, value) => sum + value, 0n);
  const parts = BOX_KINDS.map((box) => ({ key: box, label: t.boxes[box], units: diagnosis.month.firstPayment[box] }));
  const month = BOX_KINDS.map((box) => ({ key: box, label: t.boxes[box], units: diagnosis.month.byBox[box] }));
  const salary = usd(answers.salaryGoalUsd);
  return (
    <div className="review">
      <p className="review-tax">{taxLine}</p>
      {tax.fallback ? <p className="review-reason">{r[REASON[tax.fallback]]}</p> : null}
      <p className="review-note">
        {tax.verified ? null : r.unverified} <a href={tax.sourceUrl}>{r.source}</a>
      </p>
      {answers.country === "MX" ? <p className="review-note">{r.assumeAbroad}</p> : null}
      {diagnosis.eligibility.status === "warn" ? (
        <section className="review-warning" aria-labelledby="warning-title">
          <h3 id="warning-title">{r.warning}</h3>
          <ul>
            {diagnosis.eligibility.conditions.map((condition) => (
              <li key={condition.id}>{condition.description}</li>
            ))}
          </ul>
          <p>{diagnosis.eligibility.note}</p>
        </section>
      ) : null}
      <h3>{fill(r.firstPayment, { amount: formatMoney(first, lang) })}</h3>
      <SplitBar parts={parts} total={first} locale={lang} />
      <h3>{r.month}</h3>
      <SplitBar parts={month} total={Object.values(diagnosis.month.byBox).reduce((sum, value) => sum + value, 0n)} locale={lang} />
      <p className="review-note">{r.monthNote}</p>
      <p className="review-salary">{fill(r.salaryLine, { amount: formatMoney(salary, lang), day: answers.payday })}</p>
      {diagnosis.month.salaryPending > 0n ? <p className="review-note">{fill(r.salaryPending, { amount: formatMoney(diagnosis.month.salaryPending, lang) })}</p> : null}
      <p className="review-note">{r.estimateBased}</p>
      <p className="review-note">{r.approval}</p>
      <p className="review-note">{r.firstSalary}</p>
      {emergency}
      <label className="confirm">
        <input type="checkbox" checked={confirmed} onChange={(event) => onConfirmed(event.target.checked)} />
        <span>{r.confirm}</span>
      </label>
    </div>
  );
}
