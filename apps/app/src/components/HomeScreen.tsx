"use client";

import type { Locale } from "@strickle/design/locale";
import type { DataText } from "@/i18n/slices";
import { HomeView } from "./HomeView";
import { useSnapshot } from "./useSnapshot";

const todayUtc = () => new Date().toISOString().slice(0, 10);

export function HomeScreen({ lang, t }: { lang: Locale; t: DataText }) {
  const { state, retry } = useSnapshot("home");
  return <HomeView lang={lang} t={t} state={state} today={todayUtc()} onRetry={retry} />;
}
