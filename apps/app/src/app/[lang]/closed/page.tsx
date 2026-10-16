import { notFound } from "next/navigation";
import { appNetwork } from "@/config/network";
import { hasLocale } from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionaries";
import { StartFrame } from "@/ui/StartFrame";

export default async function ClosedPage({ params }: PageProps<"/[lang]/closed">) {
  const { lang } = await params;
  if (!hasLocale(lang)) notFound();
  const t = await getDictionary(lang);
  return (
    <StartFrame lang={lang} brand={t.shell.brand} skip={t.nav.skip} progress={null} testnet={appNetwork() === "mainnet" ? null : t.start.testnet}>
      <h1 className="screen-title">{t.access.closedTitle}</h1>
      <p>{t.access.closedBody}</p>
    </StartFrame>
  );
}
