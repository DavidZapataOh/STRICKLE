"use client";

import dynamic from "next/dynamic";
import { useMemo } from "react";
import { useStoredSession } from "@/account/use-session";
import type { Locale } from "@/i18n/config";
import type { SettingsText } from "@/i18n/slices";
import { accountOf } from "@/settings/account";
import { SettingsView } from "./SettingsView";

// the chain, sealing and wallet code load only for an account that exists
const SettingsActive = dynamic(() => import("./SettingsActive").then((m) => m.SettingsActive));

export function SettingsScreen({ lang, t }: { lang: Locale; t: SettingsText }) {
  const session = useStoredSession();
  const account = useMemo(() => accountOf(session ?? null), [session]);
  if (session === undefined) return <SettingsView lang={lang} t={t} state={{ status: "loading" }} />;
  if (!account) return <SettingsView lang={lang} t={t} state={{ status: "signedOut" }} />;
  return <SettingsActive lang={lang} t={t} account={account} />;
}
