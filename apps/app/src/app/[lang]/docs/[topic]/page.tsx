import { notFound } from "next/navigation";
import { DocsTopic } from "@/components/DocsView";
import { TOPIC_SLUGS, topicBySlug } from "@/docs/topics";
import { hasLocale } from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionaries";
import { AppShell } from "@/ui/AppShell";

export const generateStaticParams = () => TOPIC_SLUGS.map((topic) => ({ topic }));

export default async function DocsTopicPage({ params }: PageProps<"/[lang]/docs/[topic]">) {
  const { lang, topic: slug } = await params;
  if (!hasLocale(lang)) notFound();
  const topic = topicBySlug(lang, slug);
  if (!topic) notFound();
  const t = await getDictionary(lang);
  return (
    <AppShell lang={lang} current="docs" t={t}>
      <DocsTopic lang={lang} t={t} topic={topic} />
    </AppShell>
  );
}
