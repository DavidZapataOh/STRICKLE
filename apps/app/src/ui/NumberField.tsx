import { useState } from "react";
import type { Locale } from "@/i18n/config";
import { parseWholeDollars } from "@/onboarding/numbers";

/** A whole number the user types the way their language writes it. The parent receives a number, or null while the text is not one. */
export function NumberField({ id, label, hint, value, locale, error, onValue }: { id: string; label: string; hint?: string; value: number | null; locale: Locale; error?: string; onValue: (value: number | null) => void }) {
  const [text, setText] = useState(value === null ? "" : String(value));
  const describedBy = [hint ? `${id}-hint` : null, error ? `${id}-error` : null].filter(Boolean).join(" ") || undefined;
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {hint ? (
        <p id={`${id}-hint`} className="field-hint">
          {hint}
        </p>
      ) : null}
      <input
        id={id}
        inputMode="numeric"
        autoComplete="off"
        value={text}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        onChange={(event) => {
          setText(event.target.value);
          onValue(parseWholeDollars(event.target.value, locale));
        }}
      />
      {error ? (
        <p id={`${id}-error`} className="field-error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
