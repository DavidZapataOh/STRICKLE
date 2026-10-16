import { notFound } from "next/navigation";
import { Activity } from "@/components/Activity";
import { PauseControl } from "@/components/PauseControl";
import { AgentOnly } from "@/lib/agent-only";
import { hasLocale } from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionaries";
import { activityText } from "@/i18n/slices";
import { AppShell } from "@/ui/AppShell";

export default async function ActivityPage({ params }: PageProps<"/[lang]/activity">) {
  const { lang } = await params;
  if (!hasLocale(lang)) notFound();
  const t = await getDictionary(lang);
  return (
    <AppShell lang={lang} current="activity" t={t} actions={<AgentOnly capability="agentPause" t={t}><PauseControl lang={lang} labels={t.pause} /></AgentOnly>}>
      <h1 className="screen-title">{t.screens.activity.title}</h1>
      <AgentOnly capability="enclaveProposals" t={t}><Activity lang={lang} t={activityText(t)} /></AgentOnly>
    </AppShell>
  );
}
