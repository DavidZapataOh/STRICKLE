"use client";

import type { Locale } from "@strickle/design/locale";
import type { DataText } from "@/i18n/slices";
import { BoxesView } from "./BoxesView";
import { useSnapshot } from "./useSnapshot";

export function BoxesScreen({ lang, t }: { lang: Locale; t: DataText }) {
  const { state, retry } = useSnapshot("boxes");
  return <BoxesView lang={lang} t={t} state={state} onRetry={retry} />;
}
