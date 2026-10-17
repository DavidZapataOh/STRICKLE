import { formatMoney } from "@strickle/design/format";
import type { Locale } from "@strickle/design/locale";
import { isoDay } from "@/activity/format";
import type { ConversionStatus } from "@/boxes/currency";
import { SWAP_DAILY_CAP } from "@/config/swap";
import { dateText } from "@/home/format";
import { fill } from "@/i18n/fill";
import type { SettingsText } from "@/i18n/slices";
import { ChoiceGroup } from "@/ui/ChoiceGroup";

export const CURRENCY_BOXES = ["payroll", "operating", "emergency", "profit"] as const;
export type CurrencyBox = (typeof CURRENCY_BOXES)[number];
export type Currencies = Record<CurrencyBox, "USD" | "EUR">;
export const ALL_DOLLARS: Currencies = { payroll: "USD", operating: "USD", emergency: "USD", profit: "USD" };

/** The currency each box is paid in, with the fixed ones named and a status line that reads the chain. The interactive parts come in as props, so this is plain markup. */
export function CurrencyControl({ lang, t, currencies, status, working = false, message, onChoose, onAllow }: { lang: Locale; t: SettingsText; currencies: Currencies; status: ConversionStatus; working?: boolean; message?: string; onChoose?(box: CurrencyBox, to: "USD" | "EUR"): void; onAllow?(): void }) {
  const c = t.currency;
  const cap = status.kind === "active" || status.kind === "paused" ? status.cap : SWAP_DAILY_CAP;
  const text =
    status.kind === "active"
      ? c.status.active
      : status.kind === "pending"
        ? fill(c.status.pending, { date: dateText(isoDay(status.from), lang) })
        : status.kind === "paused"
          ? fill(c.status.paused, { reason: c.reason[status.reason] })
          : status.kind === "not-allowed"
            ? c.status.notAllowed
            : c.status.unavailable;
  const locked = status.kind === "unavailable" || working;
  return (
    <div className="currency">
      <p className="note">{fill(c.explain, { cap: formatMoney(cap, lang) })}</p>
      <p className="note" role="status" data-status={status.kind}>
        {text}
      </p>
      {status.kind === "not-allowed" ? (
        <button type="button" className="btn" data-variant="primary" disabled={working} onClick={onAllow}>
          {working ? c.allowing : c.allow}
        </button>
      ) : null}
      {CURRENCY_BOXES.map((box) => (
        <ChoiceGroup
          key={box}
          name={`currency-${box}`}
          legend={t.boxes[box]}
          options={[
            { value: "USD" as const, label: c.usd },
            { value: "EUR" as const, label: c.eur },
          ]}
          value={currencies[box]}
          onChange={(to) => onChoose?.(box, to)}
          disabled={locked}
        />
      ))}
      <p className="note">
        {t.boxes.salary}: {c.fixed.salary}
      </p>
      <p className="note">
        {t.boxes.taxes}: {c.fixed.taxes}
      </p>
      {message ? (
        <p className="note" aria-live="polite">
          {message}
        </p>
      ) : null}
    </div>
  );
}
