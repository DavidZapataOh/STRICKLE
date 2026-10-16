import Link from "next/link";
import { notFound } from "next/navigation";
import { appNetwork } from "@/config/network";
import { hasLocale } from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionaries";
import { StartFrame } from "@/ui/StartFrame";

export default async function UnavailablePage({ params }: PageProps<"/[lang]/unavailable">) {
  const { lang } = await params;
  if (!hasLocale(lang)) notFound();
  const t = await getDictionary(lang);
  return (
    <StartFrame lang={lang} brand={t.shell.brand} skip={t.nav.skip} progress={null} testnet={appNetwork() === "mainnet" ? null : t.start.testnet}>
      <h1 className="screen-title">{t.unavailable.title}</h1>
      <p>{t.unavailable.body}</p>
      <p>
        <Link className="btn" data-variant="quiet" href={`/${lang}/metrics`}>
          {t.unavailable.numbers}
        </Link>
      </p>
    </StartFrame>
  );
}
