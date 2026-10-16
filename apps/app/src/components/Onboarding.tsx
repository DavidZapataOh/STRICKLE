"use client";
import { useEffect, useReducer, useState } from "react";
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries";
import { fill } from "@/i18n/fill";
import { type Outcome } from "@/onboarding/create";
import { previewDiagnosis } from "@/onboarding/actions";
import { type Answers, type ErrorKey, fingerprint, ready, stepsFor } from "@/onboarding/answers";
import { reviveDiagnosis } from "@/onboarding/diagnosis-json";
import { type AccountMode, initialState, reduce } from "@/onboarding/reducer";
import { COUNTRIES, type Country } from "@/onboarding/types";
import { ChoiceGroup } from "@/ui/ChoiceGroup";
import { NumberField } from "@/ui/NumberField";
import { StartFrame } from "@/ui/StartFrame";
import { AccountPanel } from "./AccountPanel";
import { DonePanel } from "./DonePanel";
import { Review } from "./Review";

const STORAGE_KEY = "strickle.start.v1";

const readSaved = (): Partial<Answers> | null => {
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Partial<Answers>) : null;
  } catch {
    return null;
  }
};
const writeSaved = (value: Answers | null) => {
  try {
    if (value) window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(value));
    else window.sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // answers are kept for convenience only
  }
};

export function Onboarding({ lang, t, initial, mode, countryNames, regimeNames, testnet }: { lang: Locale; t: Dictionary; initial: Partial<Answers>; mode: AccountMode; countryNames: Record<Country, string>; regimeNames: Partial<Record<Country, string>>; testnet: boolean }) {
  const [state, dispatch] = useReducer(reduce, undefined, () => initialState(initial, mode));
  const [attempt, setAttempt] = useState(0);
  const [confirmedFor, setConfirmedFor] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const { answers, step, phase, errors, diagnosis, status } = state;
  const fp = fingerprint(answers);
  const steps = stepsFor(answers);
  const s = t.start;
  const err = (key: ErrorKey) => (errors.includes(key) ? s.errors[key] : undefined);
  const [hasLanding] = useState(() => Object.keys(initial).length > 0);

  // answers survive a reload of the tab, unless the landing just sent fresh ones
  useEffect(() => {
    if (hasLanding) return;
    const saved = readSaved();
    if (saved) dispatch({ type: "set", patch: saved });
  }, [hasLanding]);
  useEffect(() => writeSaved(answers), [answers]);

  // the diagnosis is computed on the server for exactly these answers; an answer for older answers is dropped by the reducer
  const hasDiagnosis = diagnosis !== null;
  useEffect(() => {
    if (phase !== "questions" || step !== "review" || hasDiagnosis) return;
    let cancelled = false;
    dispatch({ type: "loading" });
    previewDiagnosis(answers)
      .then((result) => {
        if (cancelled) return;
        if (result.ok) dispatch({ type: "diagnosis", value: result.diagnosis, fingerprint: fp });
        else dispatch({ type: "failed", fingerprint: fp });
      })
      .catch(() => {
        if (!cancelled) dispatch({ type: "failed", fingerprint: fp });
      });
    return () => {
      cancelled = true;
    };
    // `answers` is read for this fingerprint only: the effect reruns when the fingerprint changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, step, fp, attempt, hasDiagnosis]);

  const total = steps.length;
  const progress = phase === "questions" ? fill(s.progress, { n: steps.indexOf(step) + 1, total }) : null;
  const frame = (children: React.ReactNode) => (
    <StartFrame lang={lang} brand={t.shell.brand} skip={t.nav.skip} progress={progress} testnet={testnet ? s.testnet : null}>
      {children}
    </StartFrame>
  );

  if (phase === "done" && outcome) {
    return frame(<DonePanel lang={lang} t={t} outcome={outcome} />);
  }
  if (phase === "account") {
    const complete = ready(answers);
    return frame(
      <AccountPanel
        lang={lang}
        t={t}
        mode={state.accountMode}
        answers={complete}
        diagnosis={diagnosis ? reviveDiagnosis(diagnosis) : null}
        onMode={(next) => dispatch({ type: next === "login" ? "account" : "questions", mode: next })}
        onDone={(result) => {
          writeSaved(null);
          setOutcome(result);
          dispatch({ type: "done" });
        }}
      />,
    );
  }

  const complete = ready(answers);
  const next = (
    <button type="button" className="btn" data-variant="primary" onClick={() => dispatch({ type: "next" })}>
      {s.next}
    </button>
  );
  return frame(
    <div className="start-step">
      {step === "profile" ? (
        <>
          <h1>{s.profile.title}</h1>
          <ChoiceGroup
            name="collection"
            legend={s.profile.title}
            value={answers.collection}
            onChange={(value) => dispatch({ type: "set", patch: { collection: value } })}
            options={[
              { value: "stablecoin", label: s.profile.stablecoin, hint: s.profile.stablecoinHint },
              { value: "bank", label: s.profile.bank, hint: s.profile.bankHint },
            ]}
            error={err("collection")}
          />
        </>
      ) : null}
      {step === "country" ? (
        <>
          <h1>{s.country.title}</h1>
          <div className="field">
            <label htmlFor="country">{s.country.label}</label>
            <select id="country" value={answers.country ?? ""} onChange={(event) => dispatch({ type: "set", patch: { country: (event.target.value || null) as Country | null } })} aria-describedby={err("country") ? "country-error" : undefined}>
              <option value="">{s.country.choose}</option>
              {COUNTRIES.map((code) => (
                <option key={code} value={code}>
                  {code === "OTHER" ? s.country.other : countryNames[code]}
                </option>
              ))}
            </select>
            {err("country") ? (
              <p id="country-error" className="field-error" role="alert">
                {err("country")}
              </p>
            ) : null}
          </div>
        </>
      ) : null}
      {step === "regime" && answers.country ? (
        <>
          <h1>{s.regime.title}</h1>
          <ChoiceGroup
            name="regime"
            legend={s.regime.title}
            value={answers.regime}
            onChange={(value) => dispatch({ type: "set", patch: { regime: value } })}
            options={[
              { value: "coded", label: fill(s.regime.coded, { regime: regimeNames[answers.country] ?? "" }) },
              { value: "other", label: s.regime.other, hint: s.regime.hint },
            ]}
            error={err("regime")}
          />
        </>
      ) : null}
      {step === "income" ? (
        <>
          <h1>{s.income.title}</h1>
          {hasLanding ? <p className="field-hint">{s.income.fromSimulator}</p> : null}
          <NumberField id="income" label={s.income.income} locale={lang} value={answers.monthlyIncomeUsd} error={err("income")} onValue={(value) => dispatch({ type: "set", patch: { monthlyIncomeUsd: value } })} />
          <NumberField id="goal" label={s.income.goal} locale={lang} value={answers.salaryGoalUsd} error={err("goal")} onValue={(value) => dispatch({ type: "set", patch: { salaryGoalUsd: value } })} />
          <NumberField id="payday" label={s.income.payday} locale={lang} value={answers.payday} error={err("payday")} onValue={(value) => dispatch({ type: "set", patch: { payday: value ?? 0 } })} />
        </>
      ) : null}
      {step === "history" ? (
        <>
          <h1>{s.history.title}</h1>
          <p>{s.history.notice}</p>
          <ChoiceGroup
            name="perMonth"
            legend={s.history.perMonth}
            value={answers.paymentsPerMonth}
            onChange={(value) => dispatch({ type: "set", patch: { paymentsPerMonth: value } })}
            options={([1, 2, 3, 4] as const).map((value) => ({ value, label: String(value) }))}
          />
          {answers.paymentDays.map((day, index) => (
            <NumberField
              key={`${answers.paymentsPerMonth}-${index}`}
              id={`day-${index}`}
              label={fill(s.history.day, { n: index + 1 })}
              locale={lang}
              value={day}
              error={index === 0 ? err("days") : undefined}
              onValue={(value) => dispatch({ type: "set", patch: { paymentDays: answers.paymentDays.map((current, at) => (at === index ? (value ?? 0) : current)) } })}
            />
          ))}
        </>
      ) : null}
      {step === "review" ? (
        <>
          <h1>{s.review.title}</h1>
          {status === "loading" || (!diagnosis && status === "idle") ? <p role="status">{s.review.loading}</p> : null}
          {status === "error" ? (
            <>
              <p className="field-error" role="alert">
                {s.review.failed}
              </p>
              <button type="button" className="btn" data-variant="quiet" onClick={() => setAttempt((count) => count + 1)}>
                {s.review.retry}
              </button>
            </>
          ) : null}
          {diagnosis && complete ? (
            <Review
              lang={lang}
              t={t}
              answers={complete}
              diagnosis={reviveDiagnosis(diagnosis)}
              regimeName={regimeNames[complete.country]}
              confirmed={confirmedFor === fp}
              onConfirmed={(value) => setConfirmedFor(value ? fp : null)}
              emergency={
                <NumberField id="emergency" label={s.review.emergency} locale={lang} value={answers.emergencyMonths} error={err("emergency")} onValue={(value) => dispatch({ type: "set", patch: { emergencyMonths: value ?? 0 } })} />
              }
            />
          ) : null}
        </>
      ) : null}
      <div className="start-actions">
        {steps.indexOf(step) > 0 ? (
          <button type="button" className="btn" data-variant="quiet" onClick={() => dispatch({ type: "back" })}>
            {s.back}
          </button>
        ) : null}
        {step === "review" ? (
          <button type="button" className="btn" data-variant="primary" disabled={!diagnosis || confirmedFor !== fp} onClick={() => dispatch({ type: "account" })}>
            {s.review.create}
          </button>
        ) : (
          next
        )}
        <button type="button" className="btn" data-variant="quiet" onClick={() => dispatch({ type: "account", mode: "login" })}>
          {s.create.login}
        </button>
      </div>
    </div>,
  );
}
