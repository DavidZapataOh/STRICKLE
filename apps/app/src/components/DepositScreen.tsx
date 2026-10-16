"use client";

import dynamic from "next/dynamic";
import { useMemo } from "react";
import { useStoredSession } from "@/account/use-session";
import type { Locale } from "@/i18n/config";
import type { DepositText } from "@/i18n/slices";
import { accountOf } from "@/settings/account";
import { Button } from "@/ui/Button";
import { EmptyState } from "@/ui/EmptyState";
import { Skeleton } from "./Skeleton";

// the chain, kit and wallet code load only for an account that exists
const DepositActive = dynamic(() => import("./DepositActive").then((m) => m.DepositActive));

export function DepositScreen({ lang, t, labels }: { lang: Locale; t: DepositText; labels: { loading: string; signedOutTitle: string; signedOutBody: string; create: string; signIn: string } }) {
  const session = useStoredSession();
  const account = useMemo(() => accountOf(session ?? null), [session]);
  if (session === undefined) return <Skeleton label={labels.loading} />;
  if (!account) {
    return (
      <EmptyState title={labels.signedOutTitle} body={labels.signedOutBody}>
        <Button href={`/${lang}/start`}>{labels.create}</Button>
        <Button href={`/${lang}/start?mode=login`} variant="quiet">
          {labels.signIn}
        </Button>
      </EmptyState>
    );
  }
  return <DepositActive lang={lang} t={t} account={account} />;
}
