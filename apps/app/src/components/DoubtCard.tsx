import { formatMoney } from "@strickle/design/format";
import type { Locale } from "@strickle/design/locale";
import type { Doubt } from "@/activity/doubt";
import { shortAddress } from "@/activity/format";
import type { Phase } from "@/agent/outcome";
import { fill } from "@/i18n/fill";
import type { ActivityText } from "@/i18n/slices";

const WORKING: readonly Phase[] = ["signing", "sending", "busy", "waiting"];

/** An arrival the agent split as income but could not be sure about: why it is in doubt and the two answers the person can give. */
export function DoubtCard({ doubt, locale, t, phase, onIncome, onMine }: { doubt: Doubt; locale: Locale; t: ActivityText; phase: Phase; onIncome(): void; onMine(): void }) {
  const copy = t.doubt;
  const blocked = WORKING.includes(phase);
  const id = `d-${doubt.arrivalId}`;
  const amount = formatMoney(doubt.amount, locale);
  return (
    <section className="proposal" aria-labelledby={id}>
      <h3 id={id}>{fill(copy.title, { amount, reason: copy.reason[doubt.flags[0] ?? "unattributed"] })}</h3>
      {doubt.flags.slice(1).map((flag) => (
        <p key={flag} className="proposal-rule">
          {copy.reason[flag]}
        </p>
      ))}
      {doubt.sender ? <p className="proposal-fingerprint">{fill(copy.from, { sender: shortAddress(doubt.sender) })}</p> : null}
      <div className="proposal-actions">
        <button type="button" className="btn" data-variant="primary" disabled={blocked} onClick={onIncome}>
          {copy.itWasIncome}
        </button>
        <button type="button" className="btn" data-variant="quiet" disabled={blocked} onClick={onMine}>
          {copy.itWasMine}
        </button>
      </div>
      <p className="proposal-phase" aria-live="polite">
        {blocked ? copy.working : phase === "failed" ? copy.failed : null}
      </p>
    </section>
  );
}
