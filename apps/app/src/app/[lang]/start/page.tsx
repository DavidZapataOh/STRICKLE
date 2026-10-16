import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { plainDate } from "@strickle/core";
import { Onboarding } from "@/components/Onboarding";
import { appNetwork } from "@/config/network";
import { hasLocale, numberLocale } from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionaries";
import { fromLandingQuery, startMode } from "@/onboarding/answers";
import { loadAppRules, regimeNames } from "@/onboarding/diagnosis";
import { COUNTRIES, type Country } from "@/onboarding/types";
import { StartFrame } from "@/ui/StartFrame";

export default async function StartPage({ params, searchParams }: PageProps<"/[lang]/start">) {
  const { lang } = await params;
  if (!hasLocale(lang)) notFound();
  const t = await getDictionary(lang);
  // reading the query is dynamic: it waits inside Suspense so the rest of the page stays static
  return (
    <Suspense fallback={<StartFrame lang={lang} brand={t.shell.brand} skip={t.nav.skip} progress={null} testnet={null}>{null}</StartFrame>}>
      <StartContent lang={lang} t={t} searchParams={searchParams} />
    </Suspense>
  );
}

async function StartContent({ lang, t, searchParams }: { lang: "en" | "es" | "pt-br"; t: Awaited<ReturnType<typeof getDictionary>>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const search = await searchParams;
  // the date is a request-time value: say so before reading it so the route can keep its static shell
  await connection();
  const now = new Date();
  const today = plainDate(now.getUTCFullYear(), now.getUTCMonth() + 1, now.getUTCDate());
  // country names are produced here so the server and the browser print the same text
  const names = new Intl.DisplayNames(numberLocale[lang], { type: "region" });
  const countryNames = Object.fromEntries(COUNTRIES.map((code) => [code, code === "OTHER" ? t.start.country.other : (names.of(code) ?? code)])) as Record<Country, string>;
  return <Onboarding lang={lang} t={t} initial={fromLandingQuery(search)} mode={startMode(search)} countryNames={countryNames} regimeNames={regimeNames(loadAppRules(), today)} testnet={appNetwork() !== "mainnet"} />;
}
