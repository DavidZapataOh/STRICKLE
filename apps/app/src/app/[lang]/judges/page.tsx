import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { getPublicClient } from "@/chain/client";
import { JudgesView } from "@/components/JudgesView";
import { type Locale, hasLocale } from "@/i18n/config";
import { type Dictionary, getDictionary } from "@/i18n/dictionaries";
import { mariaDoor } from "@/server/judges";
import { AppShell } from "@/ui/AppShell";

export default async function JudgesPage({ params }: PageProps<"/[lang]/judges">) {
  const { lang } = await params;
  if (!hasLocale(lang)) notFound();
  const t = await getDictionary(lang);
  // the chain is read at request time: the shell stays static and the María door fills in
  return (
    <AppShell lang={lang} current="verify" t={t}>
      <Suspense fallback={<JudgesView lang={lang} t={t} maria={{ status: "checking" }} />}>
        <Doors lang={lang} t={t} />
      </Suspense>
    </AppShell>
  );
}

async function Doors({ lang, t }: { lang: Locale; t: Dictionary }) {
  await connection();
  return <JudgesView lang={lang} t={t} maria={await mariaDoor(getPublicClient())} />;
}
