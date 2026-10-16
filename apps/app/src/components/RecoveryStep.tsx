import { useState } from "react";
import type { Dictionary } from "@/i18n/dictionaries";
import { fill } from "@/i18n/fill";
import { CONFIRM_GROUPS, confirmsRecovery, groupsOf } from "@/keys/recovery-code";

/** Shows the recovery code and asks for two of its groups back before the account is created: a saved code is checked, not assumed. */
export function RecoveryStep({ t, code, onConfirmed }: { t: Dictionary; code: string; onConfirmed: () => void }) {
  const r = t.start.recovery;
  const [typed, setTyped] = useState<[string, string]>(["", ""]);
  const [wrong, setWrong] = useState(false);
  const [first, second] = CONFIRM_GROUPS;
  return (
    <section className="recovery" aria-labelledby="recovery-title">
      <h2 id="recovery-title">{r.title}</h2>
      <p>{r.body}</p>
      <p className="recovery-label">{r.label}</p>
      <ol className="recovery-code" aria-label={r.label}>
        {groupsOf(code).map((group, index) => (
          <li key={index}>
            <span className="recovery-index">{index + 1}</span>
            <span className="recovery-group">{group}</span>
          </li>
        ))}
      </ol>
      <h3>{r.confirmTitle}</h3>
      <p>{fill(r.confirmBody, { a: first + 1, b: second + 1 })}</p>
      {[first, second].map((index, position) => (
        <div key={index} className="field">
          <label htmlFor={`recovery-group-${index}`}>{fill(r.group, { n: index + 1 })}</label>
          <input
            id={`recovery-group-${index}`}
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            value={typed[position]}
            onChange={(event) => {
              setWrong(false);
              setTyped((current) => (position === 0 ? [event.target.value, current[1]] : [current[0], event.target.value]));
            }}
          />
        </div>
      ))}
      {wrong ? (
        <p className="field-error" role="alert">
          {r.mismatch}
        </p>
      ) : null}
      <button
        type="button"
        className="btn"
        data-variant="primary"
        onClick={() => {
          if (confirmsRecovery(code, typed)) onConfirmed();
          else setWrong(true);
        }}
      >
        {r.confirm}
      </button>
    </section>
  );
}
