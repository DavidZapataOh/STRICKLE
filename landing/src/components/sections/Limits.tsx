import { limits as c } from "@/content/landing";
import { Section, SectionTitle } from "./Section";

export function Limits() {
  return (
    <Section id={c.id} className="border-t border-edge">
      <SectionTitle kicker={c.kicker} title={c.title} />
      <ol className="mt-14 grid gap-6 md:grid-cols-3">
        {c.items.map((it, i) => (
          <li key={it.title} className={`rise rise-${i + 1} flex flex-col rounded-[6px] border border-edge bg-panel p-6`}>
            <span className="font-mono text-[11px] tabular-nums text-ink-muted">0{i + 1}</span>
            <h3 className="mt-4 font-display text-[19px] font-bold leading-snug text-ink">{it.title}</h3>
            <p className="mt-3 font-body text-[15px] leading-normal text-ink-muted">{it.body}</p>
          </li>
        ))}
      </ol>
    </Section>
  );
}
