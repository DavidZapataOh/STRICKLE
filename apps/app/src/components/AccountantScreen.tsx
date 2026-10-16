"use client";

import type { Locale } from "@strickle/design/locale";
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { ACCOUNTANT_KEY } from "@/accountant/storage-name";
import type { AccountantText } from "@/i18n/slices";
import { wrappedSecretStore } from "@/keys/secret-store";
import { Skeleton } from "./Skeleton";

// the pool's cryptography loads when a key exists or is about to be made, not before the page can say what it is for
const AccountantNotes = dynamic(() => import("./AccountantNotes").then((m) => m.AccountantNotes));

/** An accountant creates or imports a view key that never leaves this browser and reads only what the pool sealed for their tier. */
export function AccountantScreen({ lang, t }: { lang: Locale; t: AccountantText }) {
  const a = t.accountant;
  const [stored, setStored] = useState<"checking" | "none" | "present">("checking");
  const [importing, setImporting] = useState(false);
  const [bad, setBad] = useState(false);

  useEffect(() => {
    void wrappedSecretStore.get(ACCOUNTANT_KEY).then((value) => setStored(value ? "present" : "none"));
  }, []);

  if (stored === "checking") return <Skeleton label={a.title} lines={2} />;
  if (stored === "present") {
    return (
      <section className="accountant">
        <AccountantNotes lang={lang} t={t} onForgotten={() => setStored("none")} />
      </section>
    );
  }

  return (
    <section className="accountant">
      <p>{a.intro}</p>
      <div className="edit-actions">
        <button
          type="button"
          className="btn"
          data-variant="primary"
          onClick={async () => {
            const { newAccountantKey, saveAccountantKey } = await import("@/accountant/keys");
            await saveAccountantKey(wrappedSecretStore, newAccountantKey());
            setStored("present");
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
            const secret = String(new FormData(event.currentTarget).get("secret") ?? "");
            const { parseSecretHex, saveAccountantKey } = await import("@/accountant/keys");
            const parsed = parseSecretHex(secret);
            if (!parsed) {
              setBad(true);
              return;
            }
            await saveAccountantKey(wrappedSecretStore, parsed);
            setBad(false);
            setStored("present");
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
