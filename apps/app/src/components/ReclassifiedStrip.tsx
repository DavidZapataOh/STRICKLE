import { formatMoney } from "@strickle/design/format";
import type { Locale } from "@strickle/design/locale";
import type { Correction } from "@/activity/doubt";
import type { Phase } from "@/agent/outcome";
import { fill } from "@/i18n/fill";
import type { ActivityText } from "@/i18n/slices";

const WORKING: readonly Phase[] = ["signing", "sending", "busy", "waiting"];

/** A correction the person made: what it was, what it is now, and one signature to put it back. */
export function ReclassifiedStrip({ correction, locale, t, phase, onUndo }: { correction: Correction; locale: Locale; t: ActivityText; phase: Phase; onUndo(): void }) {
  const copy = t.doubt;
  const blocked = WORKING.includes(phase);
  return (
    <div className="proposal-actions">
      <p className="proposal-state">{fill(copy.corrected, { amount: formatMoney(correction.amount, locale), to: copy.classes[correction.to], from: copy.classes[correction.from] })}</p>
      <button type="button" className="btn" data-variant="quiet" disabled={blocked} onClick={onUndo}>
        {blocked ? copy.working : phase === "failed" ? copy.failed : copy.undo}
      </button>
    </div>
  );
}
