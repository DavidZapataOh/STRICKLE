import { regulation as c } from "@/content/landing";
import { Section, SectionTitle } from "./Section";

export function Regulation() {
  return (
    <Section id={c.id}>
      <SectionTitle kicker={c.kicker} title={c.title} intro={c.intro} />

      <ol className="mt-14 grid gap-x-10 gap-y-10 md:grid-cols-3">
        {c.clauses.map((cl, i) => (
          <li key={cl.ref} className={`rise rise-${i + 1} double-rule pt-5`}>
            <p className="font-mono text-[11.5px] uppercase tracking-[0.10em] text-ink-muted">{cl.ref}</p>
            <blockquote className="mt-4 font-mono text-[14px] leading-relaxed text-ink">
              <span aria-hidden="true">“</span>
              {cl.quote}
              <span aria-hidden="true">”</span>
            </blockquote>
            <p className="mt-4 font-body text-[15px] leading-normal text-ink-muted">{cl.reading}</p>
          </li>
        ))}
      </ol>

      <ol className="rise rise-4 mt-16 grid gap-x-8 gap-y-6 border-t border-edge pt-6 md:grid-cols-4">
        {c.clocks.map((k) => (
          <li key={k.when} className="min-w-0">
            <p className="font-display text-[20px] font-extrabold leading-none tabular-nums text-ink">{k.when}</p>
            <p className="mt-2 font-body text-[14px] leading-snug text-ink">{k.what}</p>
            <p className="mt-1.5 font-mono text-[11px] uppercase tracking-[0.08em] text-ink-muted">
              {k.ref} · {k.status}
            </p>
          </li>
        ))}
      </ol>
    </Section>
  );
}
