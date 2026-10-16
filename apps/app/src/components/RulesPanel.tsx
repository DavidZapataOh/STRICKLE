"use client";

import type { Locale } from "@strickle/design/locale";
import { useState } from "react";
import type { Address } from "viem";
import { isoDay } from "@/activity/format";
import type { BoxRule, BoxState } from "@/chain/totals";
import { dateText } from "@/home/format";
import { ruleWords } from "@/home/rule-words";
import { fill } from "@/i18n/fill";
import type { SettingsText } from "@/i18n/slices";
import { usd } from "@/onboarding/answers";
import { type Call, applyRuleCalls, cancelRuleCalls, setRuleCalls } from "@/settings/calls";
import type { PendingRule } from "@/settings/chain";
import { classifyRuleChange, loosenWaitSeconds, sameRule } from "@/settings/rules";
import type { TxPhase } from "@/settings/tx";
import { ListRow } from "@/ui/ListRow";

type ReadBox = (box: number) => Promise<{ rule: BoxRule; pending: PendingRule | null }>;
type Run = (calls: Call[], confirmed: () => Promise<boolean>) => Promise<TxPhase>;

function RuleForm({ t, vault, box, current, busy, onRun, readBox }: { t: SettingsText; vault: Address; box: number; current: BoxRule; busy: boolean; onRun: Run; readBox: ReadBox }) {
  const [hours, setHours] = useState(String(Math.round(current.delaySeconds / 3600)));
  const [always, setAlways] = useState(current.alwaysDelayed);
  const [restricted, setRestricted] = useState(current.restricted);
  const [floor, setFloor] = useState(String(current.floor / 1_000_000n));
  const [lock, setLock] = useState(current.lockedUntil > 0 ? new Date(current.lockedUntil * 1000).toISOString().slice(0, 10) : "");

  const h = /^[0-9]{1,4}$/.test(hours) ? Number(hours) : null;
  const f = /^[0-9]{1,9}$/.test(floor) ? Number(floor) : null;
  const lockSeconds = lock === "" ? 0 : Math.floor(Date.parse(`${lock}T00:00:00Z`) / 1000);
  const next: BoxRule | null = h !== null && f !== null && Number.isFinite(lockSeconds) ? { delaySeconds: h * 3600, alwaysDelayed: always, restricted, floor: usd(f), lockedUntil: lockSeconds } : null;
  const same = next ? sameRule(current, next) : false;
  const kind = next && !same ? classifyRuleChange(current, next) : null;

  return (
    <form
      className="edit-form"
      onSubmit={async (event) => {
        event.preventDefault();
        if (!next || same) return;
        await onRun(setRuleCalls({ vault, box, rule: next }), async () => {
          const read = await readBox(box);
          return kind === "immediate" ? sameRule(read.rule, next) : read.pending !== null && sameRule(read.pending.rule, next);
        });
      }}
    >
      <label>
        {t.rules.hours}
        <input inputMode="numeric" value={hours} onChange={(event) => setHours(event.target.value)} />
      </label>
      <label>
        <input type="checkbox" checked={always} onChange={(event) => setAlways(event.target.checked)} /> {t.rules.always}
      </label>
      <label>
        <input type="checkbox" checked={restricted} onChange={(event) => setRestricted(event.target.checked)} /> {t.rules.restricted}
      </label>
      <label>
        {t.rules.floor}
        <input inputMode="numeric" value={floor} onChange={(event) => setFloor(event.target.value)} />
      </label>
      <label>
        {t.rules.lock}
        <input type="date" value={lock} onChange={(event) => setLock(event.target.value)} />
      </label>
      <p className="edit-note" role="status" aria-live="polite">
        {same ? t.rules.same : kind === "immediate" ? t.rules.stricter : kind === "delayed" ? fill(t.rules.looser, { hours: Math.round(loosenWaitSeconds(current) / 3600) }) : ""}
      </p>
      <button type="submit" className="btn" data-variant="primary" disabled={busy || !next || same}>
        {t.settings.save}
      </button>
    </form>
  );
}

/** One row per box: the rule in words, the change waiting to be applied, and a form whose confirmation says whether the change applies now or waits. */
export function RulesPanel({ lang, t, vault, boxes, pending, now, busy, onRun, readBox }: { lang: Locale; t: SettingsText; vault: Address; boxes: BoxState[]; pending: (PendingRule | null)[]; now: number; busy: boolean; onRun: Run; readBox: ReadBox }) {
  return (
    <ul className="rule-list">
      {boxes.map((box) => {
        const change = pending[box.id - 1] ?? null;
        return (
          <li key={box.id} className="rule-box">
            <ListRow title={t.boxes[box.kind]} rule={ruleWords(box.rule, now, lang, t.boxesPage)} />
            {change ? (
              <div className="rule-pending">
                <p>{fill(t.rules.pending, { date: dateText(isoDay(change.effectiveAt), lang), rule: ruleWords(change.rule, now, lang, t.boxesPage) })}</p>
                <div className="edit-actions">
                  {now >= change.effectiveAt ? (
                    <button
                      type="button"
                      className="btn"
                      data-variant="primary"
                      disabled={busy}
                      onClick={() =>
                        void onRun(applyRuleCalls({ vault, box: box.id }), async () => {
                          const read = await readBox(box.id);
                          return read.pending === null && sameRule(read.rule, change.rule);
                        })
                      }
                    >
                      {t.rules.apply}
                    </button>
                  ) : null}
                  <button type="button" className="btn" data-variant="quiet" disabled={busy} onClick={() => void onRun(cancelRuleCalls({ vault, box: box.id }), async () => (await readBox(box.id)).pending === null)}>
                    {t.rules.cancel}
                  </button>
                </div>
              </div>
            ) : null}
            <details className="rule-edit">
              <summary>{t.settings.change}</summary>
              <RuleForm t={t} vault={vault} box={box.id} current={box.rule} busy={busy} onRun={onRun} readBox={readBox} />
            </details>
          </li>
        );
      })}
    </ul>
  );
}
