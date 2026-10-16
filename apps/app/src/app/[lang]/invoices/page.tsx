import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { InvoicesScreen } from "@/components/InvoicesScreen";
import { hasLocale } from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionaries";
import { invoicesText } from "@/i18n/slices";
import { AppShell } from "@/ui/AppShell";

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function InvoicesPage({ params }: PageProps<"/[lang]/invoices">) {
  const { lang } = await params;
  if (!hasLocale(lang)) notFound();
  const t = await getDictionary(lang);
  return (
    <AppShell lang={lang} current="invoices" t={t}>
      <h1 className="screen-title">{t.screens.invoices.title}</h1>
      <InvoicesScreen lang={lang} t={invoicesText(t)} />
    </AppShell>
  );
}
