import { notFound } from "next/navigation";
import { Activity } from "@/components/Activity";
import { hasLocale } from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionaries";
import { activityText } from "@/i18n/slices";
import { AppShell } from "@/ui/AppShell";

export default async function ActivityPage({ params }: PageProps<"/[lang]/activity">) {
  const { lang } = await params;
  if (!hasLocale(lang)) notFound();
  const t = await getDictionary(lang);
  return (
    <AppShell lang={lang} current="activity" t={t}>
      <h1 className="screen-title">{t.screens.activity.title}</h1>
      <Activity lang={lang} t={activityText(t)} />
    </AppShell>
  );
}
