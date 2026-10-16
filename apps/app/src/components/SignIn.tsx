import Link from "next/link";
import { useState } from "react";
import type { Session } from "@/account/session";
import type { Locale } from "@/i18n/config";
import type { ActivityText } from "@/i18n/slices";
import { isPasskeyCancelled } from "@/wallet/errors";

/** The state of a visitor with no account on this device. The wallet and chain code load only when the button is pressed. */
export function SignIn({ lang, t, onSignedIn }: { lang: Locale; t: ActivityText; onSignedIn: (session: Session) => void }) {
  const copy = t.activity;
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [noAccount, setNoAccount] = useState(false);
  return (
    <section className="signin" aria-labelledby="signin-title">
      <h2 id="signin-title">{copy.signedOutTitle}</h2>
      <p>{copy.signedOutBody}</p>
      {failed ? (
        <p className="field-error" role="alert">
          {copy.signInFailed}
        </p>
      ) : null}
      {noAccount ? (
        <p className="field-error" role="alert">
          {copy.noAccount} <Link href={`/${lang}/start`}>{copy.createAccount}</Link>
        </p>
      ) : null}
      <button
        type="button"
        className="btn"
        data-variant="primary"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setFailed(false);
          try {
            const { signInWithPasskey } = await import("@/account/sign-in");
            const result = await signInWithPasskey();
            if (result === "no-account") setNoAccount(true);
            else onSignedIn(result);
          } catch (error) {
            // a dismissed prompt is the person's choice, not an error to report
            if (!isPasskeyCancelled(error)) setFailed(true);
          } finally {
            setBusy(false);
          }
        }}
      >
        {copy.signIn}
      </button>
    </section>
  );
}
