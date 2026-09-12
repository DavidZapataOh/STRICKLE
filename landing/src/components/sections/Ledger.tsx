import { ledger as c } from "@/content/landing";
import { Section, SectionTitle } from "./Section";

function Record({
  label,
  rows,
  sealed = false,
  className = "",
}: {
  label: string;
  rows: ReadonlyArray<ReadonlyArray<string>>;
  sealed?: boolean;
  className?: string;
}) {
  return (
    <div className={className}>
      <p className="font-mono text-[11px] uppercase tracking-[0.10em] text-ink-muted">{label}</p>
      <dl className="mt-4 flex flex-col">
        {rows.map(([k, v]) => (
          <div key={k} className="flex items-baseline gap-3 border-b border-edge py-2.5 font-mono text-[13px]">
            <dt className="text-ink-muted">{k}</dt>
            <span aria-hidden="true" className="leader" />
            {sealed ? (
              <dd className="flex items-center gap-2">
                <span aria-hidden="true" className="hatch w-16" />
                <span className="text-[11px] uppercase tracking-[0.08em] text-ink-muted">{v}</span>
              </dd>
            ) : (
              <dd className="tabular-nums text-ink">{v}</dd>
            )}
          </div>
        ))}
      </dl>
    </div>
  );
}

export function Ledger() {
  return (
    <Section id={c.id} className="border-t border-edge">
      <SectionTitle kicker={c.kicker} title={c.title} />
      <div className="mt-14 grid gap-12 md:grid-cols-[1fr_1px_1fr] md:gap-14">
        <Record className="rise rise-1" label={c.publicSide.label} rows={c.publicSide.rows} />
        <div aria-hidden="true" className="hidden bg-ink md:block" />
        <Record className="rise rise-2" label={c.privateSide.label} rows={c.privateSide.rows} sealed />
      </div>
      <p className="rise rise-3 mt-10 max-w-[720px] font-body text-[15px] leading-normal text-ink-muted">{c.note}</p>
    </Section>
  );
}
