import { useState } from "react";
import type { Address } from "viem";
import type { Dictionary } from "@/i18n/dictionaries";
import type { NoticeKey } from "@/keys/notice-key";
import { restoreFromCode } from "@/keys/restore";

/** Gives a device that lost the notice key its key back from the recovery code. `verify` tries it on a real notice when the caller can read one. */
export function RestoreKey({ vault, t, verify, onRestored, onSkip }: { vault: Address; t: { start: { restore: Dictionary["start"]["restore"] } }; verify?: (key: NoticeKey) => Promise<boolean | "unknown">; onRestored: (verified: boolean) => void; onSkip?: () => void }) {
  const r = t.start.restore;
  const [code, setCode] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <section className="restore" aria-labelledby="restore-title">
      <h2 id="restore-title">{r.title}</h2>
      <p>{r.body}</p>
      <div className="field">
        <label htmlFor="restore-code">{r.label}</label>
        <input id="restore-code" autoComplete="off" autoCapitalize="characters" spellCheck={false} value={code} onChange={(event) => setCode(event.target.value)} />
      </div>
      {message ? (
        <p className="field-error" role="alert">
          {message}
        </p>
      ) : null}
      <button
        type="button"
        className="btn"
        data-variant="primary"
        disabled={busy || code.trim() === ""}
        onClick={async () => {
          setBusy(true);
          const result = await restoreFromCode(vault, code, verify).catch(() => null);
          setBusy(false);
          if (result?.ok) onRestored(result.verified);
          else setMessage(result?.reason === "mismatch" ? r.mismatch : r.invalid);
        }}
      >
        {r.button}
      </button>
      {onSkip ? (
        <button type="button" className="btn" data-variant="quiet" onClick={onSkip}>
          {r.skip}
        </button>
      ) : null}
    </section>
  );
}
