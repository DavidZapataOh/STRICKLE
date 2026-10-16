import { notFound } from "next/navigation";
import { PauseControl } from "@/components/PauseControl";
import { AgentOnly } from "@/lib/agent-only";
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
    <AppShell lang={lang} current="settings" t={t} actions={<AgentOnly capability="agentPause" t={t}><PauseControl lang={lang} labels={t.pause} /></AgentOnly>}>
      <h1 className="screen-title">{t.screens.settings.title}</h1>
      <AgentOnly capability="agentSettings" t={t}><SettingsScreen lang={lang} t={settingsText(t)} /></AgentOnly>
    </AppShell>
  );
}
