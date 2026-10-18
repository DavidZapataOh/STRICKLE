import { GUARANTEES } from "@/config/guarantees";
import type { Locale } from "@/i18n/config";
import { fill } from "@/i18n/fill";
import type { Dictionary } from "@/i18n/dictionaries";
import type { ContractRow } from "@/server/proof";
import { Card } from "@/ui/Card";

const LOCALE: Record<Locale, string> = { en: "en", es: "es", "pt-br": "pt-BR" };

/** How long ago, in the language of the screen and in the largest unit that is not zero. */
export function ago(seconds: number, lang: Locale): string {
  const rtf = new Intl.RelativeTimeFormat(LOCALE[lang], { numeric: "auto" });
  const span = Math.max(0, seconds);
  if (span < 60) return rtf.format(-Math.round(span), "second");
  if (span < 3_600) return rtf.format(-Math.floor(span / 60), "minute");
  if (span < 86_400) return rtf.format(-Math.floor(span / 3_600), "hour");
  return rtf.format(-Math.floor(span / 86_400), "day");
}

/** The public page: every contract with its state, what each one enforces with the code and the test that pin it, whether the agent is alive, and what the page does not prove. */
export function ProofView({ lang, t, contracts, activity, now, explorer, repo }: { lang: Locale; t: Pick<Dictionary, "proof">; contracts: ContractRow[] | null; activity: { lastWriteAt: number | null; lastTx: `0x${string}` | null } | null; now: number; explorer: string; repo: string }) {
  const p = t.proof;
  const file = (path: string) => `${repo}/blob/main/${path}`;
  const state = (row: ContractRow) => (!row.deployed ? p.contracts.notDeployed : row.verified === true ? p.contracts.verified : row.verified === false ? p.contracts.notVerified : p.contracts.unknown);
  return (
    <div className="public-view">
      <p className="note">{p.intro}</p>
      <Card as="section" aria-labelledby="proof-contracts">
        <h2 id="proof-contracts">{p.contracts.title}</h2>
        {contracts === null ? (
          <p className="note">{p.unreadable}</p>
        ) : (
          <ul className="proof-list">
            {contracts.map((row) => (
              <li key={row.name}>
                <strong>{row.name}</strong>
                <a className="proof-address" href={`${explorer}/address/${row.address}`} rel="noreferrer" target="_blank">
                  {row.address}
                </a>
                <span className="note" data-state={!row.deployed ? "missing" : row.verified === true ? "verified" : "unverified"}>
                  {row.deployed ? `${p.contracts.deployed} · ${state(row)}` : state(row)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Card as="section" aria-labelledby="proof-guarantees">
        <h2 id="proof-guarantees">{p.guarantees.title}</h2>
        <p className="note">{p.guarantees.intro}</p>
        <ul className="proof-list">
          {GUARANTEES.map((entry) => (
            <li key={entry.id}>
              <p>{entry.text[lang]}</p>
              <p className="note">
                {p.guarantees.function}: <a href={file(entry.source)} rel="noreferrer" target="_blank">{entry.function}(</a>) · {p.guarantees.test}: <a href={file(entry.test)} rel="noreferrer" target="_blank">{entry.testName}</a>
              </p>
            </li>
          ))}
        </ul>
      </Card>
      <Card as="section" aria-labelledby="proof-agent">
        <h2 id="proof-agent">{p.agent.title}</h2>
        {activity === null ? (
          <p className="note">{p.unreadable}</p>
        ) : activity.lastWriteAt === null ? (
          <p className="note">{p.agent.none}</p>
        ) : (
          <p className="note">
            {fill(p.agent.last, { when: ago(now - activity.lastWriteAt, lang) })}{" "}
            {activity.lastTx ? (
              <a href={`${explorer}/tx/${activity.lastTx}`} rel="noreferrer" target="_blank">
                {p.agent.tx}
              </a>
            ) : null}
          </p>
        )}
      </Card>
      <Card as="section" aria-labelledby="proof-honest">
        <h2 id="proof-honest">{p.honest.title}</h2>
        <p>{p.honest.body}</p>
      </Card>
    </div>
  );
}
