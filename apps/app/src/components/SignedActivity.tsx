"use client";

import type { ArrivalClass } from "@strickle/brain";
import type { Locale } from "@strickle/design/locale";
import { useEffect, useRef, useState } from "react";
import { type Doubt, correctionsOf, doubtsOf } from "@/activity/doubt";
import { loadAnswered, saveAnswered } from "@/activity/doubt-store";
import { conversionLines } from "@/activity/conversion";
import { earnLines } from "@/activity/earn";
import { dateTimeText } from "@/activity/format";
import { verifyKeyAgainstNotices } from "@/activity/key-check";
import { useActivity } from "@/activity/use-activity";
import type { Session } from "@/account/session";
import { reclassifyAction } from "@/agent/arrival-actions";
import { confirmDecision } from "@/agent/confirm";
import { withProposalLock } from "@/agent/lock";
import type { FailReason, Phase } from "@/agent/outcome";
import { sendAgentAction } from "@/agent/send";
import { getPublicClient } from "@/chain/client";
import { readVault } from "@/chain/vault";
import { executorFirstBlock } from "@/config/network";
import { AgentOnly } from "@/lib/agent-only";
import { EmptyState } from "@/ui/EmptyState";
import { fill } from "@/i18n/fill";
import type { ActivityText } from "@/i18n/slices";
import { type NoticeKey, loadNoticeKey } from "@/keys/notice-key";
import { connectWallet } from "@/wallet/passkey";
import { DoubtCard } from "./DoubtCard";
import { ProposalCard } from "./ProposalCard";
import { ReceiptStrip } from "./ReceiptStrip";
import { ReclassifiedStrip } from "./ReclassifiedStrip";
import { RestoreKey } from "./RestoreKey";

type Progress = { phase: Phase; reason?: FailReason; decision?: "approve" | "reject"; anotherTab?: boolean };

/** The receipts and proposals of a signed-in account, and the decisions the person can take with their passkey. */
export function SignedActivity({ session, lang, t }: { session: Session; lang: Locale; t: ActivityText }) {
  const copy = t.activity;
  const [key, setKey] = useState<NoticeKey | null | undefined>(undefined);
  const [unverified, setUnverified] = useState(false);
  const [paused, setPaused] = useState(false);
  const [progress, setProgress] = useState<Record<string, Progress>>({});
  const [answered, setAnswered] = useState<ReadonlySet<string>>(() => loadAnswered(session.vault));
  const wallet = useRef<Awaited<ReturnType<typeof connectWallet>> | undefined>(undefined);

  useEffect(() => {
    void loadNoticeKey(session.vault).then(setKey);
    void readVault(session.vault).then((vault) => setPaused(vault.agentPaused), () => undefined);
  }, [session.vault]);

  const activity = useActivity({ vault: session.vault, key: key ?? null, locale: lang });

  const decide = async (proposalId: string, digest: `0x${string}`, kind: "approve" | "reject") => {
    const set = (phase: Phase, reason?: FailReason, anotherTab = false) => setProgress((current) => ({ ...current, [proposalId]: { phase, reason, decision: kind, anotherTab } }));
    const run = await withProposalLock(proposalId, async () => {
      const sinceBlock = (await getPublicClient().getBlockNumber()) - 1n;
      wallet.current ??= await connectWallet("login", session.username);
      const action = kind === "approve" ? ({ kind: "approve", proposalId, digest } as const) : ({ kind: "reject", proposalId } as const);
      const status = kind === "approve" ? "executed" : "rejected";
      const outcome = await sendAgentAction({
        wallet: wallet.current,
        vault: session.vault,
        action,
        onPhase: (phase) => set(phase),
        confirm: () => confirmDecision({ vault: session.vault, key: key ?? null, proposalId, status, sinceBlock }),
      });
      set(outcome.phase, outcome.reason);
      if (outcome.phase === "confirmed") activity.reload();
    });
    if (!run.ran) set("idle", undefined, true);
  };

  const correct = async (arrivalId: string, to: ArrivalClass, learn?: Doubt["sender"]) => {
    const set = (phase: Phase, reason?: FailReason) => setProgress((current) => ({ ...current, [arrivalId]: { phase, reason } }));
    try {
      wallet.current ??= await connectWallet("login", session.username);
      const outcome = await sendAgentAction({
        wallet: wallet.current,
        vault: session.vault,
        action: reclassifyAction({ arrivalId, to, ...(learn ? { learn } : {}) }),
        onPhase: (phase) => set(phase),
        confirm: async () => true,
      });
      // the relay accepted it; the card stays locked until the agent's notice arrives and replaces it
      set(outcome.phase === "confirmed" ? "waiting" : "failed", outcome.reason);
      if (outcome.phase === "confirmed") activity.reload();
    } catch {
      set("failed");
    }
  };
  const acknowledge = (arrivalId: string) => {
    const next = new Set(answered).add(arrivalId);
    setAnswered(next);
    saveAnswered(session.vault, next);
  };

  if (key === undefined || activity.status === "loading") return <p aria-live="polite">{copy.loading}</p>;
  if (activity.status === "error") {
    return (
      <div>
        <p role="alert">{copy.loadFailed}</p>
        <button type="button" className="btn" data-variant="quiet" onClick={activity.reload}>
          {copy.retry}
        </button>
      </div>
    );
  }

  const doubts = doubtsOf(activity.notices, answered);
  const corrections = correctionsOf(activity.notices);
  const plan = [...activity.notices].reverse().find((notice) => notice.kind === "plan");
  const conversions = conversionLines([...activity.notices].reverse(), lang, t.boxes, plan?.kind === "plan" ? (plan.settings.currencies ?? {}) : {});
  const earned = earnLines([...activity.timedNotices].reverse(), lang, t.boxes);
  const pending = activity.proposals.filter((proposal) => proposal.state === "pending" || progress[proposal.proposalId]);
  return (
    <div className="activity">
      {key === null ? (
        <>
          <section className="key-missing" aria-labelledby="key-missing-title">
            <h2 id="key-missing-title">{copy.key.missingTitle}</h2>
            <p>{copy.key.missingBody}</p>
          </section>
          <RestoreKey
            vault={session.vault}
            t={t}
            verify={async (candidate) => ({ matches: true, mismatch: false, unknown: "unknown" as const })[verifyKeyAgainstNotices(activity.sealed, session.vault, candidate)]}
            onRestored={(verified) => {
              setUnverified(!verified);
              void loadNoticeKey(session.vault).then(setKey);
            }}
          />
        </>
      ) : null}
      {unverified ? <p className="activity-note">{t.start.restore.unverified}</p> : null}
      {key && activity.unreadable > 0 ? <p className="activity-note">{fill(copy.key.unreadable, { count: activity.unreadable })}</p> : null}
      {activity.truncated ? <p className="activity-note">{copy.truncated}</p> : null}
      <AgentOnly capability="enclaveProposals" t={t}>
      {pending.length > 0 ? (
        <section aria-labelledby="pending-title">
          <h2 id="pending-title" className="section-title">{copy.pendingHeading}</h2>
          {pending.map((proposal) => {
            const own = progress[proposal.proposalId];
            return (
              <ProposalCard
                key={proposal.proposalId}
                proposal={proposal}
                locale={lang}
                t={t}
                phase={own?.phase ?? "idle"}
                reason={own?.reason}
                decision={own?.decision}
                anotherTab={own?.anotherTab}
                paused={paused}
                now={activity.now}
                onApprove={() => void decide(proposal.proposalId, proposal.digest, "approve")}
                onReject={() => void decide(proposal.proposalId, proposal.digest, "reject")}
              />
            );
          })}
        </section>
      ) : null}
      {doubts.length > 0 || corrections.length > 0 ? (
        <section aria-labelledby="doubt-heading">
          <h2 id="doubt-heading" className="section-title">{t.doubt.heading}</h2>
          {doubts.map((doubt) => (
            <DoubtCard
              key={doubt.arrivalId}
              doubt={doubt}
              locale={lang}
              t={t}
              phase={progress[doubt.arrivalId]?.phase ?? "idle"}
              onIncome={() => acknowledge(doubt.arrivalId)}
              onMine={() => void correct(doubt.arrivalId, "own-transfer", doubt.sender ?? undefined)}
            />
          ))}
          {corrections.map((correction) => (
            <ReclassifiedStrip
              key={correction.arrivalId}
              correction={correction}
              locale={lang}
              t={t}
              phase={progress[correction.arrivalId]?.phase ?? "idle"}
              onUndo={() => void correct(correction.arrivalId, correction.from)}
            />
          ))}
        </section>
      ) : null}
      {conversions.length > 0 ? (
        <section aria-labelledby="conversions-title">
          <h2 id="conversions-title" className="section-title">{t.currency.activityTitle}</h2>
          {conversions.slice(0, 10).map((line) => (
            <p key={line.id} className="activity-note" data-kind={line.kind}>
              {line.text}
            </p>
          ))}
        </section>
      ) : null}
      {earned.length > 0 ? (
        <section aria-labelledby="earn-title">
          <h2 id="earn-title" className="section-title">{t.earn.activityTitle}</h2>
          {earned.slice(0, 10).map((line) => (
            <p key={line.id} className="activity-note" data-kind={line.kind}>
              <time dateTime={new Date(line.timestamp * 1000).toISOString()}>{dateTimeText(line.timestamp, lang)}</time> {line.text}
            </p>
          ))}
        </section>
      ) : null}
      </AgentOnly>
      <section aria-labelledby="history-title">
        <h2 id="history-title" className="section-title">{copy.historyHeading}</h2>
        {activity.receipts.length === 0 ? (
          <EmptyState title={t.screens.activity.emptyTitle} body={t.screens.activity.emptyBody} />
        ) : (
          activity.receipts.map((receipt) => <ReceiptStrip key={receipt.id} receipt={receipt} locale={lang} t={t} />)
        )}
        <p className="activity-note">{fill(copy.since, { block: executorFirstBlock().toString() })}</p>
      </section>
    </div>
  );
}
