import { notFound } from "next/navigation";
import { DepositScreen } from "@/components/DepositScreen";
import { hasLocale } from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionaries";
import { depositText } from "@/i18n/slices";
import { AppShell } from "@/ui/AppShell";

export default async function DepositPage({ params }: PageProps<"/[lang]/deposit">) {
  const { lang } = await params;
  if (!hasLocale(lang)) notFound();
  const t = await getDictionary(lang);
  const signedOut = t.home.states.signedOut;
  return (
    <AppShell lang={lang} current="deposit" t={t}>
      <h1 className="screen-title">{t.screens.deposit.title}</h1>
      <DepositScreen lang={lang} t={depositText(t)} labels={{ loading: t.home.states.loading, signedOutTitle: signedOut.title, signedOutBody: signedOut.body, create: signedOut.create, signIn: signedOut.signIn }} />
    </AppShell>
  );
}
