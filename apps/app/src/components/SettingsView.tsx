import { formatMoney } from "@strickle/design/format";
import type { Locale } from "@strickle/design/locale";
import type { ReactNode } from "react";
import { isoDay } from "@/activity/format";
import { dateText } from "@/home/format";
import { fill } from "@/i18n/fill";
import type { SettingsText } from "@/i18n/slices";
import type { SettingsModel } from "@/settings/model";
import { Card } from "@/ui/Card";
import { Chip } from "@/ui/Chip";
import { EmptyState } from "@/ui/EmptyState";
import { Skeleton } from "./Skeleton";

export type SettingsState = { status: "loading" } | { status: "signedOut" } | { status: "error" } | { status: "ready"; model: SettingsModel };
/** The interactive parts. The screen passes them in; the view itself is plain markup and renders on the server. */
export type SettingsSlots = { agentEdit?: ReactNode; resume?: ReactNode; autonomy?: ReactNode; salary?: ReactNode; cushion?: ReactNode; rules?: ReactNode; retry?: ReactNode };

const STATE_KEY = { running: "running", paused: "paused", "halted-user": "haltedUser", "halted-safety": "haltedSafety", none: "none" } as const;
const short = (address: string) => `${address.slice(0, 6)}…${address.slice(-4)}`;

export function SettingsView({ lang, t, state, slots = {} }: { lang: Locale; t: SettingsText; state: SettingsState; slots?: SettingsSlots }) {
  const s = t.settings;
  if (state.status === "loading") return <Skeleton label={s.loading} />;
  if (state.status === "signedOut") return <EmptyState title={t.screens.settings.title} body={s.signedOut} />;
  if (state.status === "error") {
    return (
      <section className="empty">
        <p>{s.error}</p>
        {slots.retry}
      </section>
    );
  }

  const { model } = state;
  const agentNote = {
    running: s.agent.runningNote,
    paused: s.agent.pausedNote,
    "halted-user": s.agent.pausedNote,
    "halted-safety": fill(s.agent.safetyNote, { codes: model.agent.haltCodes.join(", ") }),
    none: "",
  }[model.agent.state];

  return (
    <div className="settings">
      {model.plan === "missing" ? <p className="notice">{s.planMissing}</p> : null}
      {model.plan === "stale" && model.asOf ? <p className="notice">{fill(s.planStale, { date: dateText(model.asOf, lang) })}</p> : null}

      <Card as="section" aria-labelledby="set-agent">
        <h2 id="set-agent">{s.agent.title}</h2>
        <p>
          <Chip>{s.agent[STATE_KEY[model.agent.state]]}</Chip>
        </p>
        {agentNote ? <p>{agentNote}</p> : null}
        {model.agent.state === "halted-user" ? (slots.resume ?? <span className="btn" data-variant="quiet">{s.agent.resumeInAgent}</span>) : null}
        {model.agent.state !== "none" ? <p>{fill(s.agent.limits, { cap: formatMoney(model.limits.capUnits, lang), hours: model.limits.windowHours })}</p> : null}
        {slots.agentEdit}
      </Card>

      {model.autonomy !== "unknown" && model.threshold !== null ? (
        <Card as="section" aria-labelledby="set-autonomy">
          <h2 id="set-autonomy">{s.autonomy.title}</h2>
          <p>{model.autonomy === "ask" ? s.autonomy.ask : `${s.autonomy.auto} ${formatMoney(model.threshold, lang)}`}</p>
          <p>{s.autonomy.limitsApply}</p>
          <p>{s.autonomy.earned}</p>
          {slots.autonomy}
        </Card>
      ) : null}

      {model.salary ? (
        <Card as="section" aria-labelledby="set-salary">
          <h2 id="set-salary">{s.salary.title}</h2>
          <p>
            {formatMoney(model.salary.proposed, lang)} · {fill(s.salary.dayValue, { day: model.salary.day })}
          </p>
          <p className="mono-line">{short(model.salary.payee)}</p>
          <p>
            {model.salary.payeeApproval === "waiting"
              ? fill(s.salary.waiting, { date: dateText(isoDay(model.salary.payeeEffectiveAt), lang) })
              : model.salary.payeeApproval === "effective"
                ? s.salary.effective
                : s.salary.notApproved}
          </p>
          {slots.salary}
        </Card>
      ) : null}

      {model.cushion ? (
        <Card as="section" aria-labelledby="set-cushion">
          <h2 id="set-cushion">{s.cushion.title}</h2>
          <p>{fill(s.cushion.value, { floor: model.cushion.floorDays, target: model.cushion.targetDays })}</p>
          {slots.cushion}
        </Card>
      ) : null}

      {slots.rules ? (
        <Card as="section" aria-labelledby="set-rules">
          <h2 id="set-rules">{t.rules.title}</h2>
          <p>{t.rules.intro}</p>
          {slots.rules}
        </Card>
      ) : null}
    </div>
  );
}
