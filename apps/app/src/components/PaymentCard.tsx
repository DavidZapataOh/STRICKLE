import { BOX_KINDS } from "@strickle/core";
import { formatMoney } from "@strickle/design/format";
import type { Locale } from "@strickle/design/locale";
import { isoDay } from "@/activity/format";
import type { Payment } from "@/chain/payments";
import { dateText } from "@/home/format";
import type { Dictionary } from "@/i18n/dictionaries";
import { SplitBar } from "@/ui/SplitBar";

/** One payment that reached the vault and how it was split between the boxes. */
export function PaymentCard({ payment, lang, t }: { payment: Payment; lang: Locale; t: Pick<Dictionary, "boxes" | "boxesPage"> }) {
  return (
    <article className="payment">
      <p className="payment-head">
        <span>{dateText(isoDay(payment.at), lang)}</span>
        <span className="note">{payment.byAgent ? t.boxesPage.payments.agent : t.boxesPage.payments.manual}</span>
        <span className="amount">{formatMoney(payment.total, lang, { asset: payment.asset })}</span>
      </p>
      <SplitBar
        total={payment.total}
        locale={lang}
        asset={payment.asset}
        parts={BOX_KINDS.filter((kind) => (payment.byBox[kind] ?? 0n) > 0n).map((kind) => ({ key: kind, label: t.boxes[kind], units: payment.byBox[kind] ?? 0n }))}
      />
    </article>
  );
}
