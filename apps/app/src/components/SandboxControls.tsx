import { ADVANCE_STEPS, type AdvanceStep, FAUCET_URL } from "@/sandbox/advance";
import type { Dictionary } from "@/i18n/dictionaries";
import { fill } from "@/i18n/fill";
import { Card } from "@/ui/Card";

const LABELS = { 1: "day", 7: "week", 30: "month" } as const;

/** Test-money tools for a testnet account: Circle's public faucet and the account's own date, which only moves forward. */
export function SandboxControls({ t, date, busy, failed, onAdvance }: { t: Pick<Dictionary, "sandbox">; date: string | null; busy: boolean; failed: boolean; onAdvance: (days: AdvanceStep) => void }) {
  const s = t.sandbox;
  return (
    <Card as="section" aria-labelledby="sandbox-title">
      <h2 id="sandbox-title" className="section-title">
        {s.title}
      </h2>
      <p className="note">{s.note}</p>
      {date ? <p>{fill(s.date, { date })}</p> : null}
      <div className="sandbox-steps">
        {ADVANCE_STEPS.map((days) => (
          <button key={days} type="button" className="btn" data-variant="quiet" disabled={busy} onClick={() => onAdvance(days)}>
            {s[LABELS[days]]}
          </button>
        ))}
      </div>
      {failed ? <p role="alert" className="note">{s.failed}</p> : null}
      <p>
        <a href={FAUCET_URL} target="_blank" rel="noreferrer">
          {s.faucet}
        </a>
      </p>
      <p className="note">{s.faucetNote}</p>
    </Card>
  );
}
