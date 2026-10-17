import { latestSnapshot } from "@strickle/db/snapshots";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { getPublicClient } from "@/chain/client";
import { MetricsView } from "@/components/MetricsView";
import { ProofView } from "@/components/ProofView";
import { Skeleton } from "@/components/Skeleton";
import { REPO_URL } from "@/config/guarantees";
import { agentDeploymentsFor, appNetwork, deploymentsFor, networkInfo } from "@/config/network";
import { type Locale, hasLocale } from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionaries";
import { sql } from "@/server/db";
import type { Metrics } from "@/server/metrics";
import { agentActivity, contractsReport, explorerVerified } from "@/server/proof";
import { AppShell } from "@/ui/AppShell";

export default async function ProofPage({ params }: PageProps<"/[lang]/proof">) {
  const { lang } = await params;
  if (!hasLocale(lang)) notFound();
  const t = await getDictionary(lang);
  return (
    <AppShell lang={lang} current="verify" t={t}>
      <h1 className="screen-title">{t.proof.title}</h1>
      <Suspense fallback={<Skeleton label={t.proof.title} />}>
        <ProofContent lang={lang} t={t} />
      </Suspense>
    </AppShell>
  );
}

async function ProofContent({ lang, t }: { lang: Locale; t: Awaited<ReturnType<typeof getDictionary>> }) {
  // everything is read when the page is opened, never while the app is built
  await connection();
  const network = appNetwork();
  const client = getPublicClient();
  const explorer = networkInfo(network).explorerUrl;
  const deployed = { ...deploymentsFor(), ...agentDeploymentsFor() } as Record<string, string | null | undefined | number | object>;
  const manifest = Object.fromEntries(Object.entries(deployed).filter(([name, value]) => typeof value === "string" && /^0x[0-9a-fA-F]{40}$/.test(value) && ["BoxVaultFactory", "AgentState", "AgentExecutor", "PolicyPool"].includes(name)).map(([name, value]) => [name, { address: value as `0x${string}` }]));
  const state = (manifest.AgentState as { address: `0x${string}` } | undefined)?.address;

  const [contracts, activity, snapshot] = await Promise.all([
    contractsReport({ manifest, client, explorer: (address) => explorerVerified(explorer, address) }).catch(() => null),
    state ? agentActivity(client, state).catch(() => null) : Promise.resolve({ lastWriteAt: null, lastTx: null }),
    latestSnapshot<Metrics>(sql(), network).catch(() => null),
  ]);
  // read once, outside the markup: the page is rendered per request
  const now = Math.floor(new Date().getTime() / 1000);
  return (
    <>
      {snapshot ? <MetricsView lang={lang} t={t} payload={snapshot.payload} /> : null}
      <ProofView lang={lang} t={t} contracts={contracts} activity={activity} now={now} explorer={explorer} repo={REPO_URL} />
    </>
  );
}
