import { notFound } from "next/navigation";
import { PauseControl } from "@/components/PauseControl";
import { SettingsScreen } from "@/components/SettingsScreen";
import { hasLocale } from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionaries";
import { settingsText } from "@/i18n/slices";
import { AppShell } from "@/ui/AppShell";

export default async function SettingsPage({ params }: PageProps<"/[lang]/settings">) {
  const { lang } = await params;
  if (!hasLocale(lang)) notFound();
  const t = await getDictionary(lang);
  return (
    <AppShell lang={lang} current="settings" t={t} actions={<PauseControl lang={lang} labels={t.pause} />}>
      <h1 className="screen-title">{t.screens.settings.title}</h1>
      <SettingsScreen lang={lang} t={settingsText(t)} />
    </AppShell>
  );
}
