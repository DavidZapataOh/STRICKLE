"use client";

import type { Locale } from "@strickle/design/locale";
import dynamic from "next/dynamic";
import { useState } from "react";
import type { Session } from "@/account/session";
import { useStoredSession } from "@/account/use-session";
import type { ActivityText } from "@/i18n/slices";
import { SignIn } from "./SignIn";

// the chain, sealing and wallet code load only for an account that exists: a visitor without one downloads none of it
const SignedActivity = dynamic(() => import("./SignedActivity").then((m) => m.SignedActivity));

export function Activity({ lang, t }: { lang: Locale; t: ActivityText }) {
  const stored = useStoredSession();
  const [signedIn, setSignedIn] = useState<Session | null>(null);
  const session = signedIn ?? stored;
  if (session === undefined) return <p aria-live="polite">{t.activity.loading}</p>;
  if (session === null) return <SignIn lang={lang} t={t} onSignedIn={setSignedIn} />;
  return <SignedActivity session={session} lang={lang} t={t} />;
}
