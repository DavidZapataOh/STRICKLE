import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PayScreen } from "@/components/PayScreen";
import { appNetwork } from "@/config/network";
import { hasLocale } from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionaries";
import { payText } from "@/i18n/slices";
import { StartFrame } from "@/ui/StartFrame";

export const metadata: Metadata = { robots: { index: false, follow: false }, referrer: "no-referrer" };

// one sample token lets the build prerender the shell; the invoice itself is read in the browser through the limited API
export const generateStaticParams = () => [{ token: "A".repeat(22) }];

export default async function PayPage({ params }: PageProps<"/[lang]/pay/[token]">) {
  const { lang, token } = await params;
  if (!hasLocale(lang) || !/^[A-Za-z0-9_-]{22}$/.test(token)) notFound();
  const t = await getDictionary(lang);
  return (
    <StartFrame lang={lang} brand={t.shell.brand} skip={t.nav.skip} progress={null} testnet={appNetwork() !== "mainnet" ? t.start.testnet : null}>
      <PayScreen lang={lang} t={payText(t)} token={token} />
    </StartFrame>
  );
}
