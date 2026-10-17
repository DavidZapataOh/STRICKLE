"use client";

import dynamic from "next/dynamic";
import { useMemo } from "react";
import { useStoredSession } from "@/account/use-session";
import type { Locale } from "@/i18n/config";
import type { InvoicesText } from "@/i18n/slices";
import { accountOf } from "@/settings/account";
import { InvoicesView } from "./InvoicesView";

// the wallet and signing code load only for an account that exists, and the passkey only on the signature button
const InvoicesActive = dynamic(() => import("./InvoicesActive").then((m) => m.InvoicesActive));

export function InvoicesScreen({ lang, t }: { lang: Locale; t: InvoicesText }) {
  const session = useStoredSession();
  const account = useMemo(() => accountOf(session ?? null), [session]);
  if (session === undefined) return <InvoicesView lang={lang} t={t} state={{ status: "loading" }} origin="" onEvent={() => {}} />;
  if (!account) return <InvoicesView lang={lang} t={t} state={{ status: "signedOut" }} origin="" onEvent={() => {}} />;
  return <InvoicesActive lang={lang} t={t} account={account} />;
}
