import { notFound } from "next/navigation";
import { BoxesScreen } from "@/components/BoxesScreen";
import { PauseControl } from "@/components/PauseControl";
import { hasLocale } from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionaries";
import { dataText } from "@/i18n/slices";
import { AppShell } from "@/ui/AppShell";

export default async function BoxesPage({ params }: PageProps<"/[lang]/boxes">) {
  const { lang } = await params;
  if (!hasLocale(lang)) notFound();
  const t = await getDictionary(lang);
  return (
    <AppShell lang={lang} current="boxes" t={t} actions={<PauseControl lang={lang} labels={t.pause} />}>
      <h1 className="screen-title">{t.screens.boxes.title}</h1>
      <BoxesScreen lang={lang} t={dataText(t)} />
    </AppShell>
  );
}
