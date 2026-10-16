import type { PlanNotice } from "@strickle/agent/notice-schema";
import { formatMoney, formatPercent } from "@strickle/design/format";
import type { Locale } from "@strickle/design/locale";
import { dateText } from "@/home/format";
import { layoutTimeline } from "@/home/timeline";
import type { DataText } from "@/i18n/slices";
import { fill } from "@/i18n/fill";

export const STRIP_DAYS = 60;

export function PayTimeline({ lang, t, plan }: { lang: Locale; t: DataText; plan: PlanNotice }) {
  const layout = layoutTimeline({ asOf: plan.asOf, days: STRIP_DAYS, events: plan.events, forecast: plan.forecast });
  const summary = layout.end
    ? fill(t.home.strip.summary, { floor: formatMoney(BigInt(plan.forecast.floor), lang), low: formatMoney(layout.end.low, lang), mid: formatMoney(layout.end.mid, lang) })
    : t.home.strip.title;
  return (
    <figure className="strip" aria-labelledby="strip-title">
      <figcaption id="strip-title" className="strip-title">{t.home.strip.title}</figcaption>
      <div className="strip-canvas">
        <svg className="strip-graphic" viewBox="0 0 100 40" preserveAspectRatio="none" role="img" aria-label={summary}>
          {layout.empty ? null : (
            <>
              <path className="strip-band" d={layout.band} />
              <line className="strip-floor" x1="0" x2="100" y1={layout.floorY} y2={layout.floorY} vectorEffect="non-scaling-stroke" />
              <path className="strip-low" d={layout.p10} vectorEffect="non-scaling-stroke" fill="none" />
              <path className="strip-mid" d={layout.p50} vectorEffect="non-scaling-stroke" fill="none" />
            </>
          )}
        </svg>
        {layout.stakes.map((stake) => (
          <span key={stake.id} className="strip-stake" data-kind={stake.kind} style={{ left: `clamp(0.75rem, ${stake.x}%, calc(100% - 0.75rem))`, top: `calc(0.5rem + ${stake.lane} * 1.75rem)` }} aria-hidden>
            {stake.id}
          </span>
        ))}
      </div>
      {layout.empty ? null : (
        <>
          <p className="strip-share">{fill(t.home.strip.above, { percent: formatPercent(plan.salary.aboveFloorBps, lang) })}</p>
          {plan.forecast.basis === "estimate" ? <p className="strip-basis">{t.home.strip.estimate}</p> : null}
        </>
      )}
      <ol className="strip-legend">
        {layout.stakes.map((stake) => (
          <li key={stake.id}>
            <span className="strip-key" data-kind={stake.kind} aria-hidden>{stake.id}</span>
            <span>{t.home.events[stake.kind]}</span>
            <span className="strip-date">{dateText(stake.date, lang)}</span>
          </li>
        ))}
      </ol>
      <dl className="strip-keys">
        <div><dt className="strip-swatch" data-line="mid" aria-hidden /><dd>{t.home.strip.typical}</dd></div>
        <div><dt className="strip-swatch" data-line="low" aria-hidden /><dd>{t.home.strip.cautious}</dd></div>
        <div><dt className="strip-swatch" data-line="floor" aria-hidden /><dd>{t.home.strip.floor}</dd></div>
      </dl>
    </figure>
  );
}
