"use client";

import { formatMoney } from "@strickle/design/format";
import { formatPercent } from "@strickle/design/format";
import type { Locale } from "@strickle/design/locale";
import { isoDay } from "@/activity/format";
import { dateText } from "@/home/format";
import { fill } from "@/i18n/fill";
import { AgentOnly } from "@/lib/agent-only";
import type { SettingsText } from "@/i18n/slices";
import type { InvestBox } from "@/yield/actions";
import type { EarnStatus } from "@/yield/status";
import type { VaultQuote } from "@/yield/vaults";
import { ChoiceGroup } from "@/ui/ChoiceGroup";
import { EditRow } from "./EditRow";

/** One box that may earn: what it holds in the vault, what it holds in cash, and the share of it the vault lets the agent move. */
export type EarnRow = { box: InvestBox; position: bigint; available: bigint; room: bigint; maxInvestBps: number };

const field = (form: FormData, name: string) => String(form.get(name) ?? "");

/** The yield vault, its live rate, and for every box that may earn where it stands and the two moves a person can ask for. The interactive parts come in as props. */
export function EarnControl({ lang, t, status, rows, quote, automatic, totals, working = false, message, onSwitch, onMove, onAllow }: { lang: Locale; t: SettingsText; status: EarnStatus; rows: readonly EarnRow[]; quote?: VaultQuote; /** The owner's setting as the agent's plan reports it; absent until the plan has been read. */ automatic?: boolean; /** What the withdrawals have earned and the ten percent fee on it; absent until the notices have been read. */ totals?: { gain: bigint; fee: bigint }; working?: boolean; message?: string; onSwitch?: (enabled: boolean) => Promise<void>; onMove: (kind: "invest" | "divest", box: InvestBox, dollars: string) => Promise<void>; onAllow?: () => void }) {
  const e = t.earn;
  const statusText =
    status.kind === "active"
      ? e.status.active
      : status.kind === "pending"
        ? fill(e.status.pending, { date: dateText(isoDay(status.from), lang) })
        : status.kind === "not-allowed"
          ? e.status.notAllowed
          : status.kind === "unreadable"
            ? e.status.unreadable
            : e.status.unavailable;
  const closed = status.kind !== "active" || working;
  const rowText = { changeLabel: t.settings.change, saveLabel: t.settings.save, cancelLabel: t.settings.cancel };
  return (
    <AgentOnly capability="agentSettings" t={t}>
    <div className="earn">
      <p className="note">{e.explain}</p>
      {quote ? (
        <p className="note">
          {quote.name} ({quote.protocol}) · {fill(e.rate, { apy: formatPercent(quote.apyBps, lang) })}
        </p>
      ) : (
        <p className="note">{e.rateDown}</p>
      )}
      <p className="note" role="status" data-status={status.kind}>
        {statusText}
      </p>
      {status.kind === "not-allowed" ? (
        <button type="button" className="btn" data-variant="primary" disabled={working} onClick={onAllow}>
          {working ? e.allowing : e.allow}
        </button>
      ) : null}
      {totals === undefined ? null : (
        <p className="note">{totals.gain > 0n ? fill(e.totals.line, { gain: formatMoney(totals.gain, lang), fee: formatMoney(totals.fee, lang) }) : e.totals.none}</p>
      )}
      {automatic === undefined ? null : (
        <div className="earn-auto">
          <p className="note">{e.auto.explain}</p>
          <ChoiceGroup
            name="earn-auto"
            legend={e.auto.title}
            options={[
              { value: "on" as const, label: e.auto.on },
              { value: "off" as const, label: e.auto.off },
            ]}
            value={automatic ? "on" : "off"}
            onChange={(next) => void onSwitch?.(next === "on").catch(() => undefined)}
            disabled={status.kind === "unavailable" || status.kind === "unreadable" || working}
          />
        </div>
      )}
      {rows.map((row) => (
        <div key={row.box} className="earn-box" data-box={row.box}>
          <h3 className="section-title">{t.boxes[row.box]}</h3>
          <p className="note">{row.position > 0n ? fill(e.position, { amount: formatMoney(row.position, lang) }) : e.positionNone}</p>
          {row.maxInvestBps > 0 ? (
            <>
              <p className="note">{fill(e.limit.share, { share: formatPercent(row.maxInvestBps, lang) })}</p>
              <EditRow {...rowText} label={`${t.boxes[row.box]}: ${e.invest}`} value="" disabled={closed} onSave={(form) => onMove("invest", row.box, field(form, "amount"))}>
                <label>
                  {e.amount}
                  <input name="amount" inputMode="decimal" autoComplete="off" />
                </label>
              </EditRow>
              {row.position > 0n ? (
                <EditRow {...rowText} label={`${t.boxes[row.box]}: ${e.divest}`} value="" disabled={closed} onSave={(form) => onMove("divest", row.box, field(form, "amount"))}>
                  <label>
                    {e.amount}
                    <input name="amount" inputMode="decimal" autoComplete="off" />
                  </label>
                </EditRow>
              ) : null}
            </>
          ) : (
            <p className="note">{e.limit.none}</p>
          )}
        </div>
      ))}
      {message ? (
        <p className="note" aria-live="polite">
          {message}
        </p>
      ) : null}
    </div>
    </AgentOnly>
  );
}
