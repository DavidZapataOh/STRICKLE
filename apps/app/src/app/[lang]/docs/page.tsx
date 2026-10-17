import { notFound } from "next/navigation";
import { Suspense } from "react";
import { DocsIndex } from "@/components/DocsView";
import { search } from "@/docs/search";
import { topicsFor } from "@/docs/topics";
import { type Locale, hasLocale } from "@/i18n/config";
import { type Dictionary, getDictionary } from "@/i18n/dictionaries";
import { AppShell } from "@/ui/AppShell";

export default async function DocsPage({ params, searchParams }: PageProps<"/[lang]/docs">) {
  const { lang } = await params;
  if (!hasLocale(lang)) notFound();
  const t = await getDictionary(lang);
  const topics = topicsFor(lang);
  // reading the query is dynamic: it waits inside Suspense so the index stays static
  return (
    <AppShell lang={lang} current="docs" t={t}>
      <Suspense fallback={<DocsIndex lang={lang} t={t} topics={topics} query={null} hits={null} />}>
        <Results lang={lang} t={t} searchParams={searchParams} />
      </Suspense>
    </AppShell>
  );
}

async function Results({ lang, t, searchParams }: { lang: Locale; t: Dictionary; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { q } = await searchParams;
  const query = (Array.isArray(q) ? q[0] : q)?.trim().slice(0, 80) ?? "";
  return <DocsIndex lang={lang} t={t} topics={topicsFor(lang)} query={query || null} hits={query ? search(lang, query) : null} />;
}
