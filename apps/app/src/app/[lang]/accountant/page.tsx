import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AccountantScreen } from "@/components/AccountantScreen";
import { hasLocale } from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionaries";
import { accountantText } from "@/i18n/slices";
import { AppShell } from "@/ui/AppShell";

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function AccountantPage({ params }: PageProps<"/[lang]/accountant">) {
  const { lang } = await params;
  if (!hasLocale(lang)) notFound();
  const t = await getDictionary(lang);
  return (
    <AppShell lang={lang} current="verify" t={t}>
      <h1 className="screen-title">{t.accountant.title}</h1>
      <AccountantScreen lang={lang} t={accountantText(t)} />
    </AppShell>
  );
}
