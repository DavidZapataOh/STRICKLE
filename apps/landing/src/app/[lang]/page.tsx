import { notFound } from "next/navigation";
import { hasLocale } from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionaries";
import { Hero } from "@/components/Hero";
import { Sequence } from "@/components/Sequence";
import { Simulator } from "@/components/Simulator";
import { Bento } from "@/components/Bento";
import { Close } from "@/components/Close";

export default async function Page({ params }: PageProps<"/[lang]">) {
  const { lang } = await params;
  if (!hasLocale(lang)) notFound();
  const t = await getDictionary(lang);
  return (
    <main>
      <Hero t={t} lang={lang} />
      <Sequence t={t} lang={lang} />
      <Simulator t={t} lang={lang} />
      <Bento t={t} lang={lang} />
      <Close t={t} lang={lang} />
    </main>
  );
}
