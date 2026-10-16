import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isAddress, zeroAddress } from "viem";
import { PublicVaultScreen } from "@/components/PublicVaultScreen";
import { hasLocale } from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionaries";
import { viewText } from "@/i18n/slices";
import { AppShell } from "@/ui/AppShell";

export const metadata: Metadata = { robots: { index: false, follow: false } };

// the page is rendered in the browser from the chain: one sample address lets the build prerender the shell, every other address is rendered on request
export const generateStaticParams = () => [{ vault: zeroAddress }];

export default async function ViewPage({ params }: PageProps<"/[lang]/view/[vault]">) {
  const { lang, vault } = await params;
  if (!hasLocale(lang) || !isAddress(vault)) notFound();
  const t = await getDictionary(lang);
  return (
    <AppShell lang={lang} current="verify" t={t}>
      <h1 className="screen-title">{t.view.title}</h1>
      <PublicVaultScreen lang={lang} t={viewText(t)} vault={vault} />
    </AppShell>
  );
}
