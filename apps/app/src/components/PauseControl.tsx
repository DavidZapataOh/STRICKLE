"use client";

import dynamic from "next/dynamic";
import { useMemo } from "react";
import { useStoredSession } from "@/account/use-session";
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries";
import { accountOf } from "@/settings/account";

// the chain and wallet code load only when this device has an account: every other visitor downloads none of it
const PauseActive = dynamic(() => import("./PauseActive").then((m) => m.PauseActive));

/** The pause control of the shell's header: nothing at all when there is no account, never a disabled or fake button. */
export function PauseControl({ labels }: { lang: Locale; labels: Dictionary["pause"] }) {
  const session = useStoredSession();
  const account = useMemo(() => accountOf(session ?? null), [session]);
  return account ? <PauseActive account={account} labels={labels} /> : null;
}
