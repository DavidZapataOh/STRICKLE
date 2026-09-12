import { faq as c } from "@/content/landing";
import { Section, SectionTitle } from "./Section";

export function Faq() {
  return (
    <Section id={c.id} className="border-t border-edge" inner="md:grid md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] md:gap-16">
      <SectionTitle kicker={c.kicker} title={c.title} />
      <div className="rise rise-2 mt-10 md:mt-0">
        {c.items.map((it, i) => (
          <details key={it.q} className="faq group border-t border-edge last:border-b" name="faq" open={i === 0}>
            <summary className="flex cursor-pointer list-none items-baseline justify-between gap-6 py-5 font-display text-[17px] font-bold leading-snug text-ink">
              {it.q}
              <span aria-hidden="true" className="faq-mark" />
            </summary>
            <p className="max-w-[560px] pb-6 font-body text-[15px] leading-normal text-ink-muted">{it.a}</p>
          </details>
        ))}
      </div>
    </Section>
  );
}
