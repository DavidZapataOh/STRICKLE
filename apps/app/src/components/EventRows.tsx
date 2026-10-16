import { formatMoney } from "@strickle/design/format";
import type { Locale } from "@strickle/design/locale";
import { dateText } from "@/home/format";
import type { EventRow } from "@/home/rows";
import type { DataText } from "@/i18n/slices";
import { fill } from "@/i18n/fill";
import { ListRow } from "@/ui/ListRow";

const ICON = {
  salary: <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden><circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" strokeWidth="2" /><path d="M8 12h8" stroke="currentColor" strokeWidth="2" /></svg>,
  payroll: <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden><path d="M5 6h14v12H5z" fill="none" stroke="currentColor" strokeWidth="2" /><path d="M5 10h14" stroke="currentColor" strokeWidth="2" /></svg>,
  tax: <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden><path d="M6 18V8m6 10V5m6 13v-7" stroke="currentColor" strokeWidth="2" /></svg>,
} as const;

export function EventRows({ lang, t, rows }: { lang: Locale; t: DataText; rows: EventRow[] }) {
  if (rows.length === 0) return null;
  return (
    <section className="events" aria-labelledby="events-title">
      <h2 id="events-title" className="section-title">{t.home.events.title}</h2>
      {rows.map((row, index) => (
        <ListRow
          key={`${row.date}-${row.kind}-${index}`}
          icon={ICON[row.kind]}
          title={row.title}
          rule={row.rule}
          trailing={
            <span className="row-figures">
              <span className="row-date">{dateText(row.date, lang)}</span>
              {row.amount !== null ? <span className="amount">{formatMoney(row.amount, lang)}</span> : null}
              {row.reserved !== null ? <span className="row-reserved">{fill(t.home.events.reserved, { amount: formatMoney(row.reserved, lang) })}</span> : null}
            </span>
          }
        />
      ))}
    </section>
  );
}
