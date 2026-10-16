import { notFound } from "next/navigation";
import { HomeScreen } from "@/components/HomeScreen";
import { PauseControl } from "@/components/PauseControl";
import { hasLocale } from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionaries";
import { dataText } from "@/i18n/slices";
import { AppShell } from "@/ui/AppShell";

export default async function HomePage({ params }: PageProps<"/[lang]">) {
  const { lang } = await params;
  if (!hasLocale(lang)) notFound();
  const t = await getDictionary(lang);
  return (
    <AppShell lang={lang} current="home" t={t} actions={<PauseControl lang={lang} labels={t.pause} />}>
      <h1 className="screen-title">{t.screens.home.title}</h1>
      <HomeScreen lang={lang} t={dataText(t)} />
    </AppShell>
  );
}
