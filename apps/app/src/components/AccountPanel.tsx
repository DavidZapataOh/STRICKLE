import { useState } from "react";
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries";
import { loadNoticeKey, generateNoticeKey, type NoticeKey } from "@/keys/notice-key";
import { encodeRecoveryCode } from "@/keys/recovery-code";
import type { Diagnosis } from "@/onboarding/diagnosis";
import { type Connected, type CreateStep, type Outcome, classifyError, connectAccount, finishCreate } from "@/onboarding/create";
import type { Ready } from "@/onboarding/types";
import { saveSession } from "@/account/session";
import { RecoveryStep } from "./RecoveryStep";
import { RestoreKey } from "./RestoreKey";

type View = { name: "form" } | { name: "recovery" } | { name: "working"; step: CreateStep } | { name: "failed"; error: "unsupported" | "cancelled" | "failed" | "notFound" } | { name: "restore"; outcome: Outcome };

/**
 * Create the account (with a recovery code the user confirms before anything is sent) or sign in. After a failure the same passkey and the same
 * notice key are used again: nothing is registered twice.
 */
export function AccountPanel({ lang, t, mode, answers, diagnosis, onMode, onDone }: { lang: Locale; t: Dictionary; mode: "register" | "login"; answers: Ready | null; diagnosis: Diagnosis | null; onMode: (mode: "register" | "login") => void; onDone: (outcome: Outcome) => void }) {
  void lang;
  const c = t.start.create;
  const [username, setUsername] = useState("");
  const [view, setView] = useState<View>({ name: "form" });
  const [connected, setConnected] = useState<Connected | null>(null);
  const [key, setKey] = useState<NoticeKey | null>(null);
  const [code, setCode] = useState("");

  const finish = async () => {
    if (!connected || !key || !answers || !diagnosis) return;
    setView({ name: "working", step: "sign" });
    try {
      onDone(await finishCreate({ connected, answers, diagnosis, userKey: key, onStep: (step) => setView({ name: "working", step }) }));
    } catch (error) {
      setView({ name: "failed", error: classifyError(error) });
    }
  };

  const connect = async () => {
    setView({ name: "working", step: "passkey" });
    try {
      const link = await connectAccount({ mode, username: username.trim() });
      setConnected(link);
      if (link.existing) {
        saveSession({ owner: link.owner, vault: link.vault, username: link.username, createdAt: Math.floor(Date.now() / 1000) });
        const outcome: Outcome = { owner: link.owner, vault: link.vault, txHash: null, existing: true };
        if (await loadNoticeKey(link.vault)) onDone(outcome);
        else setView({ name: "restore", outcome });
        return;
      }
      const fresh = generateNoticeKey();
      setKey(fresh);
      setCode(encodeRecoveryCode(fresh.secret));
      setView({ name: "recovery" });
    } catch (error) {
      const kind = classifyError(error);
      setView({ name: "failed", error: kind === "failed" && mode === "login" ? "notFound" : kind });
    }
  };

  if (view.name === "recovery") return <RecoveryStep t={t} code={code} onConfirmed={finish} />;
  if (view.name === "restore") return <RestoreKey vault={view.outcome.vault} t={t} onRestored={() => onDone(view.outcome)} onSkip={() => onDone(view.outcome)} />;

  const busy = view.name === "working";
  const canRegister = mode === "register" && answers !== null && diagnosis !== null;
  return (
    <section className="account" aria-labelledby="account-title">
      <h2 id="account-title">{mode === "login" ? c.loginTitle : c.title}</h2>
      {mode === "login" ? <p>{c.loginHint}</p> : null}
      <div className="field">
        <label htmlFor="passkey-name">{c.username}</label>
        <p id="passkey-name-hint" className="field-hint">
          {c.usernameHint}
        </p>
        <input id="passkey-name" autoComplete="username webauthn" maxLength={64} aria-describedby="passkey-name-hint" value={username} onChange={(event) => setUsername(event.target.value)} />
      </div>
      <ul className="progress" aria-live="polite">
        {view.name === "working" ? <li>{c.steps[view.step]}</li> : null}
      </ul>
      {view.name === "failed" ? (
        <p className="field-error" role="alert">
          {c.errors[view.error]}
        </p>
      ) : null}
      {view.name === "failed" && connected && key ? (
        <button type="button" className="btn" data-variant="primary" onClick={finish}>
          {c.retry}
        </button>
      ) : (
        <button type="button" className="btn" data-variant="primary" disabled={busy || username.trim() === "" || (mode === "register" && !canRegister)} onClick={connect}>
          {mode === "login" ? c.loginButton : c.button}
        </button>
      )}
      <button type="button" className="btn" data-variant="quiet" disabled={busy} onClick={() => onMode(mode === "login" ? "register" : "login")}>
        {mode === "login" ? c.newAccount : c.login}
      </button>
    </section>
  );
}
