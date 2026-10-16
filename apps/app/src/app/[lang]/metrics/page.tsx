import { latestSnapshot } from "@strickle/db/snapshots";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { Skeleton } from "@/components/Skeleton";
import { appNetwork } from "@/config/network";
import { type Locale, hasLocale } from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionaries";
import { sql } from "@/server/db";
import type { Metrics } from "@/server/metrics";
import { Amount } from "@/ui/Amount";
import { AppShell } from "@/ui/AppShell";
import { Card } from "@/ui/Card";
import { EmptyState } from "@/ui/EmptyState";
import { ListRow } from "@/ui/ListRow";

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
  const { payload } = snapshot;
  const units = (value: string) => BigInt(value);
  return (
    <div className="public-view">
      <Card as="section" aria-labelledby="m-vaults">
        <h2 id="m-vaults">{m.vaults}</h2>
        <ListRow title={m.team} trailing={<span className="amount">{payload.vaults.team}</span>} />
        <ListRow title={m.organic} trailing={<span className="amount">{payload.vaults.organic}</span>} />
      </Card>
      <Card as="section" aria-labelledby="m-held">
        <h2 id="m-held">{m.held}</h2>
        <ListRow title={m.team} trailing={<Amount units={units(payload.usdcHeld.team)} locale={lang} />} />
        <ListRow title={m.organic} trailing={<Amount units={units(payload.usdcHeld.organic)} locale={lang} />} />
      </Card>
      <Card as="section" aria-labelledby="m-allocated">
        <h2 id="m-allocated">{m.allocated}</h2>
        <ListRow title={m.team} trailing={<Amount units={units(payload.usdcAllocated.team)} locale={lang} />} />
        <ListRow title={m.organic} trailing={<Amount units={units(payload.usdcAllocated.organic)} locale={lang} />} />
      </Card>
      <Card as="section" aria-labelledby="m-unmeasured">
        <h2 id="m-unmeasured">{m.notMeasured}</h2>
        {payload.notMeasured.map((name) => (
          <ListRow key={name} title={m.names[name as keyof typeof m.names] ?? name} trailing={<span className="note">{m.notMeasured}</span>} />
        ))}
      </Card>
      <p className="note">
        {m.block} {payload.asOfBlock}
      </p>
    </div>
  );
}
