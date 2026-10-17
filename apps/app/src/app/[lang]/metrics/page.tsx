import { latestSnapshot } from "@strickle/db/snapshots";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { MetricsView } from "@/components/MetricsView";
import { Skeleton } from "@/components/Skeleton";
import { appNetwork } from "@/config/network";
import { type Locale, hasLocale } from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionaries";
import { sql } from "@/server/db";
import type { Metrics } from "@/server/metrics";
import { AppShell } from "@/ui/AppShell";
import { EmptyState } from "@/ui/EmptyState";

export default async function MetricsPage({ params }: PageProps<"/[lang]/metrics">) {
  const { lang } = await params;
  if (!hasLocale(lang)) notFound();
  const t = await getDictionary(lang);
  return (
    <AppShell lang={lang} current="verify" t={t}>
      <h1 className="screen-title">{t.metrics.title}</h1>
      <Suspense fallback={<Skeleton label={t.metrics.title} />}>
        <MetricsContent lang={lang} t={t} />
      </Suspense>
    </AppShell>
  );
}

async function MetricsContent({ lang, t }: { lang: Locale; t: Awaited<ReturnType<typeof getDictionary>> }) {
  // the numbers are the latest recorded snapshot: read at request time, never at build
  await connection();
  const m = t.metrics;
  let snapshot: Awaited<ReturnType<typeof latestSnapshot<Metrics>>>;
  try {
    snapshot = await latestSnapshot<Metrics>(sql(), appNetwork());
  } catch {
    return <EmptyState title={m.title} body={m.unavailable} />;
  }
  if (!snapshot) return <EmptyState title={m.title} body={m.empty} />;
  return <MetricsView lang={lang} t={t} payload={snapshot.payload} />;
}
