"use client";

import { formatMoney } from "@strickle/design/format";
import type { Locale } from "@strickle/design/locale";
import type { ViewKey } from "@strickle/pool/crypto/keys";
import { useEffect, useState } from "react";
import { clearAccountantKey, loadAccountantKey, newAccountantKey, parseSecretHex, publicKeyHex, saveAccountantKey, secretHex } from "@/accountant/keys";
import { type AccountantNote, readAccountantNotes } from "@/accountant/notes";
import { isoDay } from "@/activity/format";
import { type RawLog, parseLogsResponse } from "@/chain/logs";
import { dateText } from "@/home/format";
import { fill } from "@/i18n/fill";
import type { AccountantText } from "@/i18n/slices";
import { wrappedSecretStore } from "@/keys/secret-store";
import { EmptyState } from "@/ui/EmptyState";
import { ListRow } from "@/ui/ListRow";
import { Skeleton } from "./Skeleton";

type Notes = AccountantNote[] | "loading" | "unavailable";

async function fetchPoolLogs(signal?: AbortSignal): Promise<RawLog[]> {
  const logs: RawLog[] = [];
  for (let page = 1; page <= 50; page += 1) {
    const response = await fetch(`/api/pool-notes?page=${page}`, { signal });
    if (!response.ok) throw new Error("unavailable");
    const body: unknown = await response.json();
    logs.push(...parseLogsResponse(body).logs);
    if (!(body as { hasMore?: boolean }).hasMore) break;
  }
  return logs;
}

/** An accountant creates or imports a view key that never leaves this browser and reads only what the pool sealed for their tier. */
export function AccountantScreen({ lang, t }: { lang: Locale; t: AccountantText }) {
  const a = t.accountant;
  const [key, setKey] = useState<ViewKey | null | undefined>(undefined);
  const [notes, setNotes] = useState<Notes>("loading");
  const [round, setRound] = useState(0);
  const [importing, setImporting] = useState(false);
  const [bad, setBad] = useState(false);

  useEffect(() => {
    void loadAccountantKey(wrappedSecretStore).then(setKey);
  }, []);

  useEffect(() => {
    if (!key) return;
    const controller = new AbortController();
    fetchPoolLogs(controller.signal).then(
      (logs) => setNotes(readAccountantNotes(logs, key)),
      () => {
        if (!controller.signal.aborted) setNotes("unavailable");
      },
    );
    return () => controller.abort();
  }, [key, round]);

  if (key === undefined) return <Skeleton label={a.title} lines={2} />;

  if (!key) {
    return (
      <section className="accountant">
        <p>{a.intro}</p>
        <div className="edit-actions">
          <button
            type="button"
            className="btn"
            data-variant="primary"
            onClick={async () => {
              const created = newAccountantKey();
              await saveAccountantKey(wrappedSecretStore, created);
              setKey(created);
            }}
          >
            {a.create}
          </button>
          <button type="button" className="btn" data-variant="quiet" onClick={() => setImporting(true)}>
            {a.import}
          </button>
        </div>
        {importing ? (
          <form
            className="edit-form"
            onSubmit={async (event) => {
              event.preventDefault();
              const parsed = parseSecretHex(String(new FormData(event.currentTarget).get("secret") ?? ""));
              if (!parsed) {
                setBad(true);
                return;
              }
              await saveAccountantKey(wrappedSecretStore, parsed);
              setBad(false);
              setKey(parsed);
            }}
          >
            <label>
              {a.importLabel}
              <input name="secret" autoComplete="off" spellCheck={false} />
            </label>
            {bad ? (
              <p className="edit-error" role="alert">
                {a.badKey}
              </p>
            ) : null}
            <button type="submit" className="btn" data-variant="primary">
              {a.useKey}
            </button>
          </form>
        ) : null}
      </section>
    );
  }

  return (
    <section className="accountant">
      <h2>{a.publicKey}</h2>
      <input className="share-field" readOnly value={publicKeyHex(key)} aria-label={a.publicKey} onFocus={(event) => event.currentTarget.select()} />
      <div className="edit-actions">
        <button
          type="button"
          className="btn"
          data-variant="quiet"
          onClick={() => {
            const link = document.createElement("a");
            link.href = URL.createObjectURL(new Blob([secretHex(key)], { type: "text/plain" }));
            link.download = "strickle-view-key.txt";
            link.click();
            URL.revokeObjectURL(link.href);
          }}
        >
          {a.backup}
        </button>
        <button
          type="button"
          className="btn"
          data-variant="quiet"
          onClick={async () => {
            await clearAccountantKey(wrappedSecretStore);
            setNotes("loading");
            setKey(null);
          }}
        >
          {a.forget}
        </button>
      </div>
      <h2>{a.notes}</h2>
      {notes === "loading" ? (
        <Skeleton label={a.notes} lines={2} />
      ) : notes === "unavailable" ? (
        <>
          <p>{a.unavailable}</p>
          <button
            type="button"
            className="btn"
            onClick={() => {
              setNotes("loading");
              setRound((value) => value + 1);
            }}
          >
            {a.retry}
          </button>
        </>
      ) : notes.length === 0 ? (
        <EmptyState title={a.notes} body={a.empty} />
      ) : (
        notes.map((note) => (
          <ListRow
            key={note.leaf}
            title={t.boxes[note.view.box]}
            rule={note.view.lockUntil > 0n ? fill(a.lockedUntil, { date: dateText(isoDay(Number(note.view.lockUntil)), lang) }) : note.view.asset}
            trailing={<span className="amount">{formatMoney(note.view.amount, lang, { asset: note.view.asset })}</span>}
          />
        ))
      )}
      <p>{a.limits}</p>
    </section>
  );
}
