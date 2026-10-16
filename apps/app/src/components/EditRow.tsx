"use client";
import { type FormEvent, type ReactNode, useState } from "react";

export function EditRow({ label, value, note, status, disabled, changeLabel, saveLabel, cancelLabel, onSave, children }: {
  label: string;
  value: ReactNode;
  note?: string;
  status?: string;
  /** The control is shown but cannot be opened; `note` says why. */
  disabled?: boolean;
  changeLabel: string;
  saveLabel: string;
  cancelLabel: string;
  /** Throws an Error whose message is already translated when the input is not acceptable. */
  onSave: (form: FormData) => Promise<void>;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const [mine, setMine] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setWorking(true);
    setMine(true);
    try {
      await onSave(form);
      setError(null);
      setOpen(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setWorking(false);
    }
  }

  return (
    <div className="edit-row">
      <div className="edit-head">
        <span className="edit-label">{label}</span>
        <span className="edit-value">{value}</span>
        {open ? null : (
          <button type="button" className="btn" data-variant="quiet" disabled={disabled} onClick={() => { setMine(false); setOpen(true); }}>
            {changeLabel}
          </button>
        )}
      </div>
      {note ? <p className="edit-note">{note}</p> : null}
      {open ? (
        <form className="edit-form" onSubmit={submit}>
          {children}
          {error ? (
            <p className="edit-error" role="alert">
              {error}
            </p>
          ) : null}
          <div className="edit-actions">
            <button type="submit" className="btn" data-variant="primary" disabled={working}>
              {saveLabel}
            </button>
            <button type="button" className="btn" data-variant="quiet" onClick={() => { setOpen(false); setError(null); }}>
              {cancelLabel}
            </button>
          </div>
        </form>
      ) : null}
      <p className="edit-status" role="status" aria-live="polite">
        {mine ? (status ?? "") : ""}
      </p>
    </div>
  );
}
