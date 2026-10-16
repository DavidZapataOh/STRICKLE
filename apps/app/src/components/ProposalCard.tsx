import { formatMoney } from "@strickle/design/format";
import type { Locale } from "@strickle/design/locale";
import { type TimelineProposal, canApprove, canReject } from "@/activity/timeline";
import { shortAddress, shortDigest } from "@/activity/format";
import type { FailReason, Phase } from "@/agent/outcome";
import { dateText, isoDay } from "@/home/format";
import { fill } from "@/i18n/fill";
import type { ActivityText } from "@/i18n/slices";

const WORKING: readonly Phase[] = ["signing", "sending", "busy", "waiting"];

/** A proposal the agent made and the user decides: the exact payment, the fingerprint the signature covers, and only the decisions that are possible right now. */
export function ProposalCard({ proposal, locale, t, phase, reason, decision, paused, now, anotherTab = false, onApprove, onReject }: { proposal: TimelineProposal; locale: Locale; t: ActivityText; phase: Phase; reason?: FailReason; decision?: "approve" | "reject"; paused: boolean; now: number; anotherTab?: boolean; onApprove(): void; onReject(): void }) {
  const copy = t.activity.proposal;
  const blocked = WORKING.includes(phase) || paused;
  const approvable = canApprove(proposal, now);
  const rejectable = canReject(proposal, now);
  let message: string | undefined;
  if (anotherTab) message = copy.anotherTab;
  else if (phase === "failed") message = reason ? t.activity.failure[reason] : t.activity.phase.failed;
  else if (phase === "confirmed") message = decision === "reject" ? t.activity.phase.confirmedReject : t.activity.phase.confirmedApprove;
  else if (phase !== "idle") message = t.activity.phase[phase];
  const id = `p-${proposal.proposalId}`;
  return (
    <section className="proposal" aria-labelledby={id}>
      <h3 id={id}>{fill(copy.title, { amount: formatMoney(proposal.amount, locale) })}</h3>
      <p>{fill(copy.to, { payee: shortAddress(proposal.payee) })}</p>
      <p className="proposal-rule">{copy.rule}</p>
      <p className="proposal-expiry">{fill(copy.expires, { date: dateText(isoDay(proposal.expiresAt), locale) })}</p>
      <p className="proposal-fingerprint">{fill(copy.fingerprint, { digest: shortDigest(proposal.digest) })}</p>
      {proposal.state === "pending" ? (
        <>
          {!proposal.verified ? (
            <p className="proposal-warning" data-tone="danger" role="alert">
              <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden>
                <path d="M12 4 3 20h18z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
                <path d="M12 10v4m0 3v.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
              <span>{copy.unverified}</span>
            </p>
          ) : null}
          {proposal.verified && !approvable ? <p className="proposal-warning">{copy.tooLate}</p> : null}
          {paused ? <p className="proposal-warning">{copy.paused}</p> : null}
          {approvable ? <p className="proposal-confirm">{copy.confirm}</p> : null}
          <div className="proposal-actions">
            {approvable ? (
              <button type="button" className="btn" data-variant="primary" disabled={blocked} onClick={onApprove}>
                {copy.approve}
              </button>
            ) : null}
            {rejectable ? (
              <button type="button" className="btn" data-variant="quiet" disabled={blocked} onClick={onReject}>
                {copy.reject}
              </button>
            ) : null}
          </div>
        </>
      ) : (
        <p className="proposal-state">{copy[proposal.state === "approved" ? "executed" : proposal.state]}</p>
      )}
      <p className="proposal-phase" aria-live="polite">
        {message ?? null}
      </p>
    </section>
  );
}
