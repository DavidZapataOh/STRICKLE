import { notFound } from "next/navigation";
import { hasLocale } from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionaries";
import { AppShell } from "@/ui/AppShell";
import { EmptyState } from "@/ui/EmptyState";

export default async function VerifyPage({ params }: PageProps<"/[lang]/verify">) {
  const { lang } = await params;
  if (!hasLocale(lang)) notFound();
  const t = await getDictionary(lang);
  const screen = t.screens.verify;
  return (
    <AppShell lang={lang} current="verify" t={t}>
      <h1 className="screen-title">{screen.title}</h1>
      <EmptyState title={screen.emptyTitle} body={screen.emptyBody} />
    </AppShell>
  );
}
