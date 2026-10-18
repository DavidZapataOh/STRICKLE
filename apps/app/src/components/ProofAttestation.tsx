import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries";
import { fill } from "@/i18n/fill";
import type { AttestationReport } from "@/server/attestation-report";
import { Card } from "@/ui/Card";
import { ago } from "./ProofView";

const short = (id: string | null) => (id === null ? "?" : `${id.slice(0, 10)}…${id.slice(-6)}`);

/** The three checks of the chain of custody after the enclave, each as it was found, with the command to recompute the workflow ID from the published source. */
export function ProofAttestation({ lang, t, report, now, explorer }: { lang: Locale; t: Pick<Dictionary, "proof">; report: AttestationReport | null; now: number; explorer: string }) {
  const a = t.proof.attestation;
  return (
    <Card as="section" aria-labelledby="proof-attestation">
      <h2 id="proof-attestation">{a.title}</h2>
      <p className="note">{a.explain}</p>
      {report === null ? (
        <p className="note">{t.proof.unreadable}</p>
      ) : (
        <>
          <h3 className="section-title">{a.contracts}</h3>
          <p className="note" data-status={report.status}>
            {a.status[report.status]}
          </p>
          <ul className="proof-list">
            {report.contracts.map((entry) => (
              <li key={entry.name}>
                <strong>{entry.name}</strong> <span className="proof-address">{short(entry.workflowId)}</span>
              </li>
            ))}
          </ul>
          <h3 className="section-title">{a.report.title}</h3>
          {"error" in report.report ? (
            <p className="note">{report.report.error === "none" ? a.report.none : a.report.unreadable}</p>
          ) : (
            <p className="note" data-status={report.report.ok ? "ok" : "failed"}>
              {report.report.ok
                ? fill(a.report.ok, { valid: report.report.valid, threshold: report.report.threshold, when: ago(now - report.report.at, lang) })
                : !report.report.matches
                  ? a.report.different
                  : fill(a.report.few, { valid: report.report.valid, threshold: report.report.threshold })}{" "}
              <a href={`${explorer}/tx/${report.report.tx}`} rel="noreferrer" target="_blank">
                {a.report.tx}
              </a>
            </p>
          )}
          <p className="note">{a.reproduce}</p>
          <pre className="proof-address">
            <code>{report.reproduce}</code>
          </pre>
        </>
      )}
      <p className="note">{a.note}</p>
    </Card>
  );
}
