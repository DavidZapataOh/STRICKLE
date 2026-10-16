import type { Locale } from "@strickle/design/locale";
import { dateText, isoDay } from "@/home/format";
import { explorerLink } from "@/config/network";
import { fill } from "@/i18n/fill";
import type { ActivityText } from "@/i18n/slices";
import type { TimelineReceipt } from "@/activity/timeline";
import { SplitBar } from "@/ui/SplitBar";
import { StruckS } from "@/ui/StruckS";

/** One receipt: what happened, the split of the payment by box, the rule behind it and, honestly, why it cannot be undone. */
export function ReceiptStrip({ receipt, locale, t }: { receipt: TimelineReceipt; locale: Locale; t: ActivityText }) {
  const copy = t.activity.receipt;
  const day = isoDay(receipt.at);
  return (
    <article className="strip">
      <header className="strip-head">
        <StruckS className="strip-mark" />
        <time dateTime={day}>{dateText(day, locale)}</time>
      </header>
      <p className="strip-text">{receipt.text}</p>
      {receipt.parts.length > 0 ? <SplitBar parts={receipt.parts.map((part) => ({ key: part.box, label: t.boxes[part.box], units: part.units }))} total={receipt.total} locale={locale} /> : null}
      <p className="strip-rule">{fill(copy.rule, { rule: copy.rules[receipt.ruleId] })}</p>
      {receipt.kind === "split" ? <p className="strip-note">{copy.rateNote}</p> : null}
      <p className="strip-undo">{copy.undo[receipt.undo.reason]}</p>
      <a className="strip-link" href={explorerLink("tx", receipt.txHash)} rel="noreferrer" target="_blank">
        {copy.tx}
      </a>
    </article>
  );
}
