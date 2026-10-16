"use client";

import { useState } from "react";
import { parseAmountInput } from "@/deposit/amount";

/** A six-decimal amount typed with a dot: the parent receives base units, or null while the text is not an amount. */
export function AmountField({ id, label, hint, onValue }: { id: string; label: string; hint?: string; onValue: (value: bigint | null) => void }) {
  const [text, setText] = useState("");
  const invalid = text !== "" && parseAmountInput(text) === null;
  const describedBy = hint ? `${id}-hint` : undefined;
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
        type="text"
        inputMode="decimal"
        autoComplete="off"
        spellCheck={false}
        value={text}
        aria-invalid={invalid ? true : undefined}
        aria-describedby={describedBy}
        onChange={(event) => {
          setText(event.target.value);
          onValue(parseAmountInput(event.target.value));
        }}
      />
    </div>
  );
}
